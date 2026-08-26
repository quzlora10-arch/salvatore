# Salvatore 1.1 - Node.js 12 uyumlu sürüm

Bu sürüm native `better-sqlite3` kullanmaz; böylece Node.js v12 32-bit ortamında Python/node-gyp zorunluluğunu kaldırır. Veriler `data/salvatore.json` dosyasında tutulur.

## Kurulum
CMD'de:
cd C:\Users\quzlo\Desktop\salvatore
rmdir /s /q node_modules
del package-lock.json
npm install
npm start

Tarayıcı:
http://localhost:3000
Yönetim:
http://localhost:3000/admin

Varsayılan admin:
admin@salvatore.local
ChangeMe123!

Üretimde şifreyi değiştir. Node.js 12 artık desteklenmemektedir; internete açık kullanım için güncel LTS önerilir.

Hotmail doğrulaması için `.env.example` dosyasını `.env` yapıp SMTP bilgilerini doldur. SMTP ayarlanmazsa geliştirme modunda doğrulama kodu CMD ekranına yazılır.
