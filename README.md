# Vozový Park - Aplikácia pre správu vozidiel

Vozový Park je fullstack aplikácia pre manažment vozového parku, ktorá umožňuje sledovanie, správu a evidenciu vozidiel.

## Technológie

### Frontend
- React.js
- Tailwind CSS
- Framer Motion pre animácie
- React Router pre navigáciu

### Backend
- Node.js s Express
- PostgreSQL databáza (na Neon.tech)

## Funkcie
- Správa používateľov (pridanie, úprava, mazanie)
- Správa vozidiel (pridanie, úprava, zobrazenie detailov, mazanie)
- Filtrovanie a zoraďovanie vozidiel
- Autentifikácia používateľov

## Inštalácia a spustenie

### Backend
```bash
cd server
npm install
# Skopírujte .env.example na .env a nastavte premenné prostredia
npm start
```

### Frontend
```bash
cd client
npm install
# Skopírujte .env.example na .env a nastavte premenné prostredia
npm start
```

## Nasadenie
- Frontend: Netlify
- Backend: Render.com
- Databáza: Neon.tech PostgreSQL

## Štruktúra projektu
- `/client` - React frontend aplikácia
- `/server` - Node.js backend API
