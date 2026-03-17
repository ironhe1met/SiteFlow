# Інструкція розгортання Tasks App

## 1. Вимоги до сервера

- Ubuntu 20.04 / 22.04
- NGINX встановлено
- SSL сертифікат (Let's Encrypt)
- Відкриті порти: 80, 443

---

## 2. Встановлення Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Перевірка:
```bash
node -v   # v20.x.x
npm -v    # 10.x.x
```

---

## 3. Встановлення PM2

PM2 — менеджер процесів, тримає додаток живим після перезавантаження сервера.

```bash
sudo npm install -g pm2
```

---

## 4. Розміщення файлів проєкту

```bash
mkdir /var/www/tasks-app
cd /var/www/tasks-app
```

Завантажити всі файли проєкту на сервер через SFTP, SCP або Git:

```bash
# Варіант через Git:
git clone https://github.com/your/repo.git .

# Варіант через SCP (з локальної машини):
scp -r ./tasks-app user@your-server:/var/www/tasks-app
```

Встановити залежності:
```bash
npm install
```

---

## 5. Налаштування .env

```bash
cp .env.example .env
nano .env
```

Заповнити всі змінні (детальніше про кожну — нижче):

```env
PORT=3000
BASE_URL=https://tasks.yoursite.com

SMTP_HOST=smtp.gmail.com
SMTP_USER=your@gmail.com
SMTP_PASS=your-app-password

ADMIN_EMAIL=your@gmail.com
ADMIN_PASS=your-secure-password

SESSION_SECRET=якийсь-довгий-випадковий-рядок
```

---

## 6. Про пошту — детально

Додаток надсилає листи у двох випадках:
- Клієнт заповнив форму → лист іде **тобі** і **клієнту**
- З якої пошти надсилається і куди — вказується у `.env`

### Які змінні відповідають за пошту:

| Змінна | Що це | Приклад |
|---|---|---|
| `SMTP_HOST` | Сервер вихідної пошти | `smtp.gmail.com` |
| `SMTP_USER` | Email з якого надсилаються листи | `tasks@yourcompany.com` |
| `SMTP_PASS` | Пароль або App Password | `abcd efgh ijkl mnop` |
| `ADMIN_EMAIL` | Куди приходять всі нові задачі (твоя пошта) | `you@yourcompany.com` |

### Якщо використовуєш Gmail:

Звичайний пароль від Gmail не підійде — потрібен **App Password**:

1. Увійди в Google акаунт → **Безпека**
2. Увімкни **двофакторну автентифікацію** (якщо не увімкнена)
3. Перейди: **Безпека → Паролі додатків**
4. Створи новий пароль для додатку → скопіюй 16-символьний код
5. Встав цей код у `SMTP_PASS`

```env
SMTP_HOST=smtp.gmail.com
SMTP_USER=tasks@gmail.com
SMTP_PASS=abcd efgh ijkl mnop
```

### Якщо використовуєш корпоративну пошту (наприклад на своєму домені):

Уточни у хостинг-провайдера або подивись у панелі керування поштою (cPanel, Plesk тощо) — там будуть дані SMTP.

```env
SMTP_HOST=mail.yourcompany.com
SMTP_USER=tasks@yourcompany.com
SMTP_PASS=your-mail-password
```

---

## 7. Про домен — детально

### Де вказувати домен:

**У `.env`:**
```env
BASE_URL=https://tasks.yoursite.com
```
Це використовується для генерації посилань на задачі у листах.
Якщо не вказати — посилання у листах будуть з `http://localhost:3000`.

**У NGINX конфігу:**
```nginx
server_name tasks.yoursite.com;
```

**У DNS (у реєстратора домену або хостингу):**
Потрібно додати A-запис для піддомену:
```
Тип:  A
Ім'я: tasks
Значення: IP-адреса твого сервера
TTL:  3600
```

Після збереження DNS-запис може поширюватись до 24 годин (зазвичай 15–30 хвилин).

---

## 8. Налаштування NGINX

```bash
sudo nano /etc/nginx/sites-available/tasks
```

Вставити:

```nginx
server {
    listen 80;
    server_name tasks.yoursite.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name tasks.yoursite.com;

    ssl_certificate     /etc/letsencrypt/live/tasks.yoursite.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tasks.yoursite.com/privkey.pem;

    client_max_body_size 50M;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Активувати і перезапустити:

```bash
sudo ln -s /etc/nginx/sites-available/tasks /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 9. SSL сертифікат для піддомену

```bash
sudo certbot --nginx -d tasks.yoursite.com
```

Certbot сам оновить NGINX конфіг і налаштує автопродовження.

---

## 10. Запуск додатку

```bash
cd /var/www/tasks-app
pm2 start server.js --name tasks-app
pm2 save
pm2 startup
```

Команду яку виведе `pm2 startup` — скопіювати і виконати (вона додає PM2 в автозапуск).

---

## 11. Перевірка

```bash
pm2 status              # додаток має бути online
pm2 logs tasks-app      # логи в реальному часі
curl http://localhost:3000  # перевірка що Node відповідає
```

Відкрити в браузері: `https://tasks.yoursite.com`

---

## Корисні команди PM2

```bash
pm2 restart tasks-app   # перезапустити після змін
pm2 stop tasks-app      # зупинити
pm2 delete tasks-app    # видалити з PM2
pm2 logs tasks-app      # логи
```

---

## Структура файлів на сервері

```
/var/www/tasks-app
  server.js
  package.json
  .env                  ← не комітити в Git!
  database.db           ← створюється автоматично
  /public
    index.html
    task.html
    tasks.html
    admin.html
    /css/style.css
    /js/form.js
  /uploads              ← створюється автоматично
```

> **Важливо:** файл `.env` і папку `uploads` додай у `.gitignore` якщо використовуєш Git.
