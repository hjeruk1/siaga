#!/bin/sh
# Jalankan SEKALI untuk inisialisasi database di dalam container
# Usage: docker exec siaga-app sh /app/docker-init.sh
cd /app
node backend/init.js
echo ""
echo "Database siap. Login dengan admin / admin123"
echo "Segera ganti password setelah login pertama!"
