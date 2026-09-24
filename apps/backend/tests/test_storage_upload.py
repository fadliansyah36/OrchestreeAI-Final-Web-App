"""
Test Storage Upload & Public Retrieval (FastAPI Runtime)
PRD v2.2 Bagian 15.3 & Bagian 16.3
"""

import json
import urllib.request
import pytest


def test_storage_upload_and_retrieval():
    # Valid PNG magic bytes
    png_bytes = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06"
        b"\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01"
        b"\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    )

    boundary = "----WebKitFormBoundaryOrchestreeTest7MA4YWxkTrZu0gW"
    body = bytearray()
    # file part
    body.extend(f"--{boundary}\r\n".encode())
    body.extend(b'Content-Disposition: form-data; name="file"; filename="avatar_sample.png"\r\n')
    body.extend(b"Content-Type: image/png\r\n\r\n")
    body.extend(png_bytes)
    body.extend(b"\r\n")
    # bucket part
    body.extend(f"--{boundary}\r\n".encode())
    body.extend(b'Content-Disposition: form-data; name="bucket"\r\n\r\n')
    body.extend(b"avatars\r\n")
    # tenant_id part
    body.extend(f"--{boundary}\r\n".encode())
    body.extend(b'Content-Disposition: form-data; name="tenant_id"\r\n\r\n')
    body.extend(b"10e75d63-15f8-42e8-a6ce-24fece12cd04\r\n")
    # end
    body.extend(f"--{boundary}--\r\n".encode())

    req = urllib.request.Request(
        "http://localhost:8001/api/v1/storage/upload",
        data=bytes(body),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )

    with urllib.request.urlopen(req, timeout=5) as resp:
        assert resp.status == 200
        result = json.loads(resp.read().decode())
        assert result["status"] == "success"
        assert result["bucket"] == "avatars"
        assert result["content_type"] == "image/png"
        assert "storage_path" in result
        assert "public_url" in result

        # Verify GET on public_url
        get_url = f"http://localhost:8001{result['public_url']}"
        with urllib.request.urlopen(get_url, timeout=5) as get_resp:
            assert get_resp.status == 200
            retrieved = get_resp.read()
            assert len(retrieved) == len(png_bytes)
            assert retrieved == png_bytes

    print("STORAGE UPLOAD & RETRIEVAL VERIFIED SUCCESSFULLY!")
    print(f"Bucket: {result['bucket']}")
    print(f"Storage Path: {result['storage_path']}")
    print(f"Public URL: {result['public_url']}")


if __name__ == "__main__":
    test_storage_upload_and_retrieval()
