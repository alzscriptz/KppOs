#!/usr/bin/env python3
"""Stream a built ISO to GoFile without loading the image into memory.

Set GOFILE_API_TOKEN in the environment. The token is never written to disk or
printed. GoFile returns a share page link after the upload completes.
"""

from __future__ import annotations

import argparse
import hashlib
import http.client
import json
import os
import secrets
import sys
from pathlib import Path


UPLOAD_HOST = "upload.gofile.io"
CHUNK_SIZE = 8 * 1024 * 1024


def multipart_part(boundary: str, name: str, value: str) -> bytes:
    return (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
        f"{value}\r\n"
    ).encode("utf-8")


def upload(path: Path, token: str, folder_id: str | None) -> dict[str, object]:
    boundary = "----------------kppos" + secrets.token_hex(18)
    parts: list[bytes] = []
    if folder_id:
        parts.append(multipart_part(boundary, "folderId", folder_id))
    file_header = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{path.name}"\r\n'
        "Content-Type: application/octet-stream\r\n\r\n"
    ).encode("utf-8")
    closing = f"\r\n--{boundary}--\r\n".encode("ascii")
    length = sum(map(len, parts)) + len(file_header) + path.stat().st_size + len(closing)

    connection = http.client.HTTPSConnection(UPLOAD_HOST, timeout=120)
    connection.putrequest("POST", "/uploadfile")
    connection.putheader("Authorization", f"Bearer {token}")
    connection.putheader("Content-Type", f"multipart/form-data; boundary={boundary}")
    connection.putheader("Content-Length", str(length))
    connection.endheaders()
    for part in parts:
        connection.send(part)
    connection.send(file_header)

    digest = hashlib.sha256()
    sent = 0
    with path.open("rb") as source:
        while chunk := source.read(CHUNK_SIZE):
            connection.send(chunk)
            digest.update(chunk)
            sent += len(chunk)
            if sent == path.stat().st_size or sent % (256 * 1024 * 1024) < CHUNK_SIZE:
                print(f"Uploaded {sent:,} / {path.stat().st_size:,} bytes", file=sys.stderr, flush=True)
    connection.send(closing)

    response = connection.getresponse()
    response_bytes = response.read()
    connection.close()
    if response.status < 200 or response.status >= 300:
        raise RuntimeError(f"GoFile upload failed with HTTP {response.status}: {response_bytes[:500].decode('utf-8', 'replace')}")
    payload = json.loads(response_bytes)
    if payload.get("status") != "ok":
        raise RuntimeError(f"GoFile rejected the upload: {json.dumps(payload, ensure_ascii=False)[:1000]}")
    data = payload.get("data") or {}
    link = data.get("downloadPage") or data.get("downloadUrl")
    if not link:
        raise RuntimeError("GoFile reported success but did not return a download link.")
    return {
        "downloadPage": link,
        "fileName": data.get("fileName", path.name),
        "size": path.stat().st_size,
        "sha256": digest.hexdigest(),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--path", type=Path, required=True, help="ISO file to upload")
    parser.add_argument("--folder-id", help="Optional GoFile destination folder ID")
    args = parser.parse_args()
    token = os.environ.get("GOFILE_API_TOKEN", "").strip()
    if not token:
        parser.error("Set GOFILE_API_TOKEN in the environment; the token is never stored in the repository.")
    path = args.path.expanduser().resolve()
    if not path.is_file() or path.suffix.lower() != ".iso":
        parser.error("--path must point to an existing .iso file")
    result = upload(path, token, args.folder_id)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
