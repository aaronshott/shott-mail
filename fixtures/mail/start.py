# Only for the isolated Docker test network. Real Dovecot + Postfix, not a protocol mock.
from pathlib import Path
import os
import shutil
import subprocess
import signal
import time
import grp

os.umask(0o077)
secrets = Path('/run/test-secrets')
mail = Path('/mail')
mail.mkdir(exist_ok=True)
os.chmod(mail, 0o755)
users = []
for user in ('work', 'private'):
    password = (secrets / user).read_text().strip()
    if not password or any(c in password for c in ':\r\n'):
        raise RuntimeError('Invalid generated fixture credential')
    users.append(f'{user}@example.test:{{PLAIN}}{password}:5000:5000::/mail/{user}::')
    home = mail / user
    for part in ('', 'cur', 'new', 'tmp'):
        (home / part).mkdir(exist_ok=True)
        os.chown(home / part, 5000, 5000)
    seed = home / 'new' / 'b1-seed'
    if not (home / '.seeded').exists():
        seed.write_text(f'From: fixture@example.test\nTo: {user}@example.test\nSubject: Alleen voor {user}\nMessage-ID: <b1-{user}@example.test>\nMIME-Version: 1.0\nContent-Type: text/plain; charset=utf-8\n\nSynthetische testmail voor {user}.\n')
        os.chown(seed, 5000, 5000)
        (home / '.seeded').touch()
Path('/etc/dovecot/test-users').write_text('\n'.join(users)+'\n')
os.chown('/etc/dovecot/test-users', 0, grp.getgrnam('dovecot').gr_gid)
os.chmod('/etc/dovecot/test-users', 0o640)
shutil.copyfile('/fixture/dovecot.conf', '/etc/dovecot/dovecot.conf')
shutil.copyfile('/fixture/main.cf', '/etc/postfix/main.cf')
shutil.copyfile('/fixture/master.cf', '/etc/postfix/master.cf')
Path('/etc/postfix/virtual-recipients').write_text('work@example.test work/\nprivate@example.test private/\n')
subprocess.run(['postmap', '/etc/postfix/virtual-recipients'], check=True)
os.chmod('/etc/postfix/virtual-recipients', 0o644)
os.chmod('/etc/postfix/virtual-recipients.db', 0o644)
subprocess.run(['postfix', 'check'], check=True)
children = [subprocess.Popen(['dovecot', '-F']), subprocess.Popen(['postfix', 'start-fg'])]
stop = False

def shutdown(*_):
    global stop
    stop = True

signal.signal(signal.SIGTERM, shutdown)
signal.signal(signal.SIGINT, shutdown)
while not stop and all(child.poll() is None for child in children):
    time.sleep(0.5)
for child in children:
    child.terminate()
for child in children:
    try:
        child.wait(timeout=10)
    except subprocess.TimeoutExpired:
        child.kill()
