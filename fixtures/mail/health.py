import ssl
import imaplib
import smtplib
from pathlib import Path

context = ssl.create_default_context(cafile='/run/test-secrets/mail.crt')
password = Path('/run/test-secrets/work').read_text().strip()
with imaplib.IMAP4_SSL('127.0.0.1', 1993, ssl_context=context, timeout=3) as imap:
    imap.login('work@example.test', password)
    assert imap.select('INBOX', readonly=True)[0] == 'OK'
with smtplib.SMTP('127.0.0.1', 1587, timeout=3) as smtp:
    smtp.starttls(context=context)
    smtp.login('work@example.test', password)
