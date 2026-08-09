# Activar la base empresarial

1. Crea un proyecto en Supabase.
2. Abre **SQL Editor** y ejecuta `supabase/migrations/001_initial_schema.sql`.
3. Copia `.env.example` como `.env.local` y completa la URL y la llave publica.
4. En Supabase Authentication crea el primer usuario staff.
5. En SQL Editor cambia su perfil a staff:

```sql
update public.profiles
set role = 'staff'
where email = 'correo-del-staff@empresa.com';
```

6. Reinicia `npm run dev`. El encabezado mostrara **Base central conectada**.

La llave publica puede estar en el navegador. Nunca pongas la llave secreta de servicio en variables que comiencen por `NEXT_PUBLIC_`.
