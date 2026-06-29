# 閮ㄧ讲璇存槑

## 鏂瑰紡涓€锛氭湰鍦板紑鍙戯紙鎺ㄨ崘鍏堣锛?
### 鍓嶇疆瑕佹眰
- Node.js 20+
- PostgreSQL 15+
- npm 鎴?pnpm

### 1. 鍒濆鍖栨暟鎹簱

```bash
# 鍒涘缓鏁版嵁搴?psql -U postgres -c "CREATE DATABASE truck_dispatch;"

# 鎵ц Schema
psql -U postgres -d truck_dispatch -f database/database.sql
```

### 2. 鍚姩鍚庣

```bash
cd backend

# 澶嶅埗閰嶇疆鏂囦欢
copy .env.example .env
# 缂栬緫 .env锛屽～鍐欐暟鎹簱瀵嗙爜銆丣WT_SECRET銆丟oogle Maps Key

# 瀹夎渚濊禆
npm install

# 寮€鍙戞ā寮?npm run start:dev
# 鍚庣杩愯鍦?http://localhost:3000
# API 鏂囨。锛歨ttp://localhost:3000/api/docs
```

### 3. 鍚姩鍓嶇

```bash
cd frontend

# 澶嶅埗閰嶇疆鏂囦欢
copy .env.example .env.local
# 濉啓 VITE_GOOGLE_MAPS_KEY

# 瀹夎渚濊禆
npm install

# 寮€鍙戞ā寮?npm run dev
# 鍓嶇杩愯鍦?http://localhost:5173
```

### 4. 鐧诲綍娴嬭瘯

榛樿绠＄悊鍛樿处鎴凤細
- 閭锛歛dmin@trucksystem.com
- 瀵嗙爜锛欰dmin@123456

鈿狅笍 **Production must use a strong admin password after first login**

---

## 鏂瑰紡浜岋細Docker Compose 閮ㄧ讲

### 鍓嶇疆瑕佹眰
- Docker 24+
- Docker Compose 2.20+

### 1. 閰嶇疆鐜鍙橀噺

```bash
# 椤圭洰鏍圭洰褰曞垱寤?.env 鏂囦欢
cat > .env << EOF
DB_PASSWORD=YourStrongPassword@2024
JWT_SECRET=your-256bit-secret-key-here
GOOGLE_MAPS_API_KEY=AIza...
EOF
```

### 2. 涓€閿惎鍔?
```bash
docker compose up -d
```

鍚姩鍚庯細
- 鍓嶇锛歨ttp://localhost
- 鍚庣 API锛歨ttp://localhost:3000
- API 鏂囨。锛歨ttp://localhost:3000/api/docs

### 3. 鏌ョ湅鏃ュ織

```bash
docker compose logs -f backend
docker compose logs -f postgres
```

### 4. 鍋滄鏈嶅姟

```bash
docker compose down
# 淇濈暀鏁版嵁搴撴暟鎹?docker compose down -v  # 娓呴櫎鎵€鏈夋暟鎹紙鎱庣敤锛?```

---

## 鏂瑰紡涓夛細鐢熶骇鏈嶅姟鍣ㄩ儴缃诧紙Ubuntu 22.04锛?
### 1. 瀹夎渚濊禆

```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PostgreSQL 15
sudo apt-get install -y postgresql-15

# Nginx
sudo apt-get install -y nginx

# PM2
npm install -g pm2
```

### 2. PostgreSQL 閰嶇疆

```bash
sudo -u postgres psql -c "CREATE USER truckuser WITH PASSWORD 'your_password';"
sudo -u postgres psql -c "CREATE DATABASE truck_dispatch OWNER truckuser;"
sudo -u postgres psql -d truck_dispatch -f /path/to/database/database.sql
```

### 3. 鍚庣閮ㄧ讲

```bash
cd /var/www/truck-dispatch/backend
npm ci
npm run build

# 閰嶇疆 .env
cat > .env << EOF
NODE_ENV=production
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=truckuser
DATABASE_PASSWORD=your_password
DATABASE_NAME=truck_dispatch
JWT_SECRET=your-jwt-secret
PORT=3000
GOOGLE_MAPS_API_KEY=your-key
EOF

# PM2 鍚姩
pm2 start dist/main.js --name truck-backend
pm2 startup
pm2 save
```

### 4. 鍓嶇鏋勫缓

```bash
cd /var/www/truck-dispatch/frontend
npm ci
VITE_GOOGLE_MAPS_KEY=your-key npm run build
# 浜х墿鍦?dist/
```

### 5. Nginx 閰嶇疆

```nginx
# /etc/nginx/sites-available/truck-dispatch
server {
    listen 80;
    server_name your-domain.com;

    root /var/www/truck-dispatch/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:3000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /uploads/ {
        proxy_pass http://localhost:3000/uploads/;
    }

    location /socket.io/ {
        proxy_pass http://localhost:3000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/truck-dispatch /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 6. SSL锛堟帹鑽愪娇鐢?Let's Encrypt锛?
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## Google Maps API 閰嶇疆

1. 璁块棶 [Google Cloud Console](https://console.cloud.google.com/)
2. 鍒涘缓椤圭洰 鈫?鍚敤 Maps JavaScript API
3. 鍒涘缓 API Key锛岄檺鍒跺埌浣犵殑鍩熷悕
4. 濉叆 `VITE_GOOGLE_MAPS_KEY`锛堝墠绔級鍜?`GOOGLE_MAPS_API_KEY`锛堝悗绔級

---

## 鐩綍缁撴瀯鎬昏

```
璐ц溅绯荤粺寮€鍙?
鈹溾攢鈹€ backend/                # NestJS 鍚庣
鈹?  鈹溾攢鈹€ src/
鈹?  鈹?  鈹溾攢鈹€ auth/          # 璁よ瘉妯″潡锛圝WT銆佺櫥褰曘€佹敞鍐岋級
鈹?  鈹?  鈹溾攢鈹€ users/         # 鐢ㄦ埛绠＄悊锛圧BAC锛?鈹?  鈹?  鈹溾攢鈹€ tasks/         # 浠诲姟绠＄悊
鈹?  鈹?  鈹溾攢鈹€ gps/           # GPS 杩借釜 + 闃蹭綔寮?鈹?  鈹?  鈹溾攢鈹€ work-records/  # 宸ユ椂璁板綍
鈹?  鈹?  鈹溾攢鈹€ adjustments/   # 宸ユ椂璋冩暣
鈹?  鈹?  鈹溾攢鈹€ notifications/ # 閫氱煡 + WebSocket 缃戝叧
鈹?  鈹?  鈹斺攢鈹€ common/        # 鍏叡 Guards銆丏ecorators
鈹?  鈹溾攢鈹€ Dockerfile
鈹?  鈹斺攢鈹€ package.json
鈹溾攢鈹€ frontend/               # React 鍓嶇
鈹?  鈹溾攢鈹€ src/
鈹?  鈹?  鈹溾攢鈹€ pages/
鈹?  鈹?  鈹?  鈹溾攢鈹€ auth/      # 鐧诲綍銆佹敞鍐?鈹?  鈹?  鈹?  鈹溾攢鈹€ admin/     # 绠＄悊鍛?璋冨害鍛樼晫闈?鈹?  鈹?  鈹?  鈹溾攢鈹€ driver/    # 鍙告満鐣岄潰
鈹?  鈹?  鈹?  鈹斺攢鈹€ client/    # 瀹㈡埛鐣岄潰
鈹?  鈹?  鈹溾攢鈹€ store/         # Redux 鐘舵€佺鐞?鈹?  鈹?  鈹溾攢鈹€ api/           # API 灏佽
鈹?  鈹?  鈹溾攢鈹€ hooks/         # useSocket 绛?鈹?  鈹?  鈹斺攢鈹€ i18n.ts        # 涓嫳鏂囧浗闄呭寲
鈹?  鈹溾攢鈹€ Dockerfile
鈹?  鈹斺攢鈹€ package.json
鈹溾攢鈹€ database/
鈹?  鈹斺攢鈹€ database.sql        # 缁熶竴鏁版嵁搴撳垵濮嬪寲鑴氭湰
鈹溾攢鈹€ docs/
鈹?  鈹溾攢鈹€ API.md             # API 鏂囨。
鈹?  鈹斺攢鈹€ DEPLOY.md          # 鏈枃浠?鈹斺攢鈹€ docker-compose.yml
```

---

## 瀹夊叏妫€鏌ユ竻鍗?
- [ ] 淇敼榛樿绠＄悊鍛樺瘑鐮?- [ ] 璁剧疆寮?JWT_SECRET锛?56浣嶉殢鏈哄瓧绗︿覆锛?- [ ] 鏁版嵁搴撲娇鐢ㄤ笓鐢ㄧ敤鎴凤紝涓嶄娇鐢?postgres 瓒呯骇鐢ㄦ埛
- [ ] 鐢熶骇鐜鍏抽棴 TypeORM synchronize锛堟敼涓?migrations锛?- [ ] Nginx 閰嶇疆 rate limiting
- [ ] 涓婁紶鏂囦欢澶у皬闄愬埗锛堝綋鍓嶉粯璁?0MB锛?- [ ] HTTPS锛圫SL 璇佷功锛?- [ ] Google Maps API Key 闄愬埗鍩熷悕

---

## 甯歌闂

**Q: 涓婁紶鏂囦欢鍚庢棤娉曡闂紵**  
A: 纭繚 `backend/uploads/` 鐩綍瀛樺湪涓旀湁鍐欐潈闄愩€侱ocker 鐜涓凡閫氳繃 volume 鎸傝浇銆?
**Q: WebSocket 杩炴帴澶辫触锛?*  
A: 妫€鏌?Nginx location /socket.io/ 閰嶇疆锛岄渶瑕?Upgrade 澶存敮鎸併€?
**Q: GPS 鍔熻兘闇€瑕?HTTPS锛?*  
A: 鏄殑锛屾祻瑙堝櫒 Geolocation API 鍦ㄧ敓浜х幆澧冭姹?HTTPS銆傛湰鍦板紑鍙?localhost 渚嬪銆?