---
description: Cara deploy aplikasi SalesFlow ke Firebase Hosting
---

# Deploy SalesFlow ke Firebase Hosting

// turbo-all

## Langkah-langkah:

1. Pastikan sudah login ke Firebase CLI:
```bash
firebase login
```

2. Push perubahan ke GitHub:
```bash
git push https://<YOUR_TOKEN>@github.com/huyinayena-commits/SalesFlow.git main
```

3. Deploy ke Firebase Hosting:
```bash
firebase deploy
```

4. Setelah berhasil, aplikasi akan tersedia di:
   - https://salesflow-35f8d.web.app
   - https://salesflow-35f8d.firebaseapp.com

## Catatan:
- Pastikan semua perubahan sudah disimpan sebelum deploy
- File yang di-deploy berada di folder `public/`
