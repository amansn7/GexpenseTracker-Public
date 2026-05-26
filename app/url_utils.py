import ipaddress
import socket
from urllib.parse import urlparse

from fastapi import HTTPException


def validate_url(url_str: str) -> str:
    try:
        parsed = urlparse(url_str)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid URL")
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=422, detail="Invalid or blocked URL")
    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(status_code=422, detail="Invalid or blocked URL")
    try:
        addrs = socket.getaddrinfo(hostname, None)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid or blocked URL")
    for family, _, _, _, sockaddr in addrs:
        ip_str = sockaddr[0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            continue
        if ip.is_private or ip.is_loopback or ip.is_reserved or ip.is_unspecified:
            raise HTTPException(status_code=422, detail="Invalid or blocked URL")
    return url_str
