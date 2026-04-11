from app.gmail.client import extract_domain, get_gmail_link

def test_extract_domain_standard():
    assert extract_domain("Amazon <no-reply@amazon.in>") == "amazon.in"

def test_extract_domain_bare():
    assert extract_domain("alerts@hdfcbank.com") == "hdfcbank.com"

def test_extract_domain_empty():
    assert extract_domain("") == ""

def test_gmail_link():
    link = get_gmail_link("abc123")
    assert link == "https://mail.google.com/mail/u/0/#inbox/abc123"
