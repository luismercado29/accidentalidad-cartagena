# ACCIONES DE ROTACIÓN DE CREDENCIALES - Neon Database

## URGENTE: Cambiar contraseña en Neon

La contraseña anterior fue expuesta:
- **Contraseña vieja:** `npg_QJAaDkCeU2X4`
- **Estado:** COMPROMETIDA - Cambiar inmediatamente

### Contraseña Nueva
```
yz0ik6fuVlvubE0XoU7HHufRxMNCfBCVxUu1KcmmsPU
```

## Pasos para Cambiar

### 1. En Neon Console
1. Ve a: https://console.neon.tech/app/projects/fragrant-pine-01152085
2. Selecciona "Settings" → "Database"
3. Busca el rol "neondb_owner"
4. Haz clic en el ícono de lápiz/editar
5. Reemplazar contraseña con: `yz0ik6fuVlvubE0XoU7HHufRxMNCfBCVxUu1KcmmsPU`
6. Guarda los cambios

### 2. En Vercel Environment Variables
1. Ve a: https://vercel.com/luisflow12-6896s-projects/accidentalidad-cartagena/settings/environment-variables
2. Busca todas las variables que contienen la contraseña antigua:
   - `DATABASE_URL`
   - `DATABASE_URL_UNPOOLED`
   - `POSTGRES_PASSWORD`
   - `POSTGRES_PRISMA_URL`
   - `POSTGRES_URL`
   - `POSTGRES_URL_NON_POOLING`
   - `POSTGRES_URL_NO_SSL`

3. Reemplaza `npg_QJAaDkCeU2X4` con `yz0ik6fuVlvubE0XoU7HHufRxMNCfBCVxUu1KcmmsPU` en cada una

### 3. Tests Locales (ya completo)
- ✅ .env.local actualizado con nueva contraseña
- ✅ init_neon_db.py verificado para conectar

## Después de Cambiar la Contraseña

Ejecuta en tu terminal local:
```bash
python init_neon_db.py
```

Debería mostrar:
```
[OK] Connecting to: ep-patient-water-angcdohp-pooler.c-6.us-east-1.aws.neon.tech
[OK] Database connection successful
```

## Seguridad

- ✅ `.env.local` está en `.gitignore` - NO se commiteará a GitHub
- ✅ Contraseña vieja nunca estuvo en commits (verificado)
- ✅ Variables de Vercel son encrypted automáticamente
- ⚠️ TODO: Cambiar la contraseña en Neon Console

## Estado Actual

| Componente | Estado | Credenciales |
|-----------|--------|-------------|
| .env.local | ✅ Actualizado | Nueva contraseña |
| .env.local en git | ✅ Protegido | En .gitignore |
| Vercel Variables | ⏳ PENDIENTE | Necesita update manual |
| Neon Database | ⏳ PENDIENTE | Necesita cambio en console |

