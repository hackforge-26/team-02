# 🍱 Surplus Food Connect

<div align="center">

[![Live Demo](https://img.shields.io/badge/Live%20Demo-surplus--food--connect-brightgreen?style=for-the-badge&logo=vercel)](https://surplus-food-connect-one.vercel.app/)
[![React 19](https://img.shields.io/badge/React-19.2-blue?style=for-the-badge&logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.2-646CFF?style=for-the-badge&logo=vite)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-Database-3ECF8E?style=for-the-badge&logo=supabase)](https://supabase.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

**Connecting surplus food with people who need it.**  
*A transparent, verified community platform enabling commercial food donors to allocate bulk surplus meals across multiple receiver NGOs through direct booking requests.*

[🌐 View Live Deployment](https://surplus-food-connect-one.vercel.app/) · [Report Bug](https://github.com/Raksha-Shetty18/Surplus-Food-Connect/issues) · [Request Feature](https://github.com/Raksha-Shetty18/Surplus-Food-Connect/issues)

</div>

---

## 🌍 Problem & Mission

Every day, restaurants, hotels, and caterers generate large quantities of wholesome surplus food that ends up in landfills, while community shelters and orphanages face meal shortages.

**Surplus Food Connect** bridges this gap by replacing the traditional single-claim model with an intelligent **Multi-Receiver Booking & Allocation System**:
* 🎯 **UN SDG 2:** Zero Hunger
* ♻️ **UN SDG 12:** Responsible Consumption & Production

---

## ✨ Key Features

### 1. 🛡️ Official Licence & Document Verification
* **Donors** submit official FSSAI licences / business registration details.
* **Receivers** submit registered NGO / trust documentation.
* **Admin Verification Portal**: Admins inspect uploaded licences in a dedicated document viewer modal before approving (`Verified`) or rejecting (`Rejected` with reason).
* **Role-based Access**: Only verified donors can publish food; only verified receivers can submit portion requests.

### 2. 📦 Multi-Receiver Portion Allocation
* Donors post bulk quantities (e.g., 100 meals).
* Multiple NGOs can request customized portions (e.g., 30 meals, 20 meals, 40 meals) from the **same donation concurrently**.
* **Overbooking Protection**: Dynamic tracking of `total_quantity`, `reserved_quantity`, and `available_quantity` strictly prevents excess allocation.

### 3. 🤝 Transparent Request ➔ Booked ➔ Received Lifecycle
* **Request:** Receiver submits request $\rightarrow$ `Pending` (*"Waiting for donor approval"*).
* **Acceptance:** Donor accepts $\rightarrow$ `Booked` (*Reserved quantity allocated*).
* **Confirmation:** Receiver physically receives food $\rightarrow$ `Received` (*Completed distribution*).
* **Cancellation & Release:** If an accepted booking is cancelled, reserved meals are immediately restored to `available_quantity`.

### 4. 📍 Location Proximity Matching
* Proximity categorization (`Same Area`, `Nearby`, `Other Area`) between donor pickup locations and receiver operational areas.
* Live filter bar by location keyword, category, and minimum meal quantities.

### 5. 📊 Admin Monitoring & RFC-4180 CSV Reports
* Real-time metrics: Total Users, Verified/Pending/Rejected counts, Total Donations, Meals Available, Active Bookings, and Completed Rescues.
* Direct CSV report generators:
  * `DOWNLOAD USERS CSV`
  * `DOWNLOAD DONATIONS CSV`
  * `DOWNLOAD REQUESTS CSV`
  * `DOWNLOAD BOOKINGS CSV`
  * `DOWNLOAD COMPLETED CSV`

---

## 🔄 Lifecycle & Workflow Architecture

```
[ Verified Commercial Donor ] ── Posts 100 Meals ──> [ Live Available Feed ]
                                                              │
                    ┌─────────────────────────────────────────┴────────────────────────────────────────┐
                    ▼                                                                                  ▼
         [ Receiver A: NGO Shelter ]                                                        [ Receiver B: Youth Home ]
          Requests 40 portions (Pending)                                                     Requests 30 portions (Pending)
                    │                                                                                  │
                    └───────────────────────────┬──────────────────────────────────────────────────────┘
                                                ▼
                                    [ Donor Reviews Requests ]
                                                │
                    ┌───────────────────────────┴──────────────────────────────────────────────────────┐
                    ▼                                                                                  ▼
            [ Accepts Receiver A ]                                                             [ Accepts Receiver B ]
       40 Reserved • Status: BOOKED                                                       30 Reserved • Status: BOOKED
                    │                                                                                  │
                    └───────────────────────────┬──────────────────────────────────────────────────────┘
                                                ▼
                                [ Remaining Available: 30 Meals ]
                                                │
                                                ▼
                                  [ Receiver Confirms Pickup ]
                                ➔ Status: RECEIVED / COMPLETED
```

---

## 🛠️ Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 19, Vite 8, JavaScript (ES6+), Modern Vanilla CSS3 |
| **Backend / Database** | Supabase (PostgreSQL, Realtime, Row-Level Security, Storage) |
| **Hosting & CI/CD** | Vercel, GitHub Pages (GitHub Actions Workflow) |
| **Tooling** | Oxlint, Rollup, Git |

---

## 📁 Project Structure

```
surplus-food-connect/
├── .github/
│   └── workflows/
│       └── deploy.yml   # Automated GitHub Pages CI/CD workflow
├── public/              # Static assets & icons
├── src/
│   ├── App.jsx          # Main application UI & state management
│   ├── main.jsx         # React application entrypoint
│   ├── style.css        # Responsive CSS design system
│   └── supabase.js      # Supabase client configuration
├── .env.example         # Template for environment variables
├── .gitignore           # Git ignore rules
├── index.html           # HTML5 document template
├── netlify.toml         # Netlify SPA configuration
├── package.json         # Project metadata and dependencies
├── vercel.json          # Vercel SPA configuration
├── vite.config.js       # Vite configuration with relative base path
└── README.md            # Comprehensive documentation
```

---

## 🚀 Getting Started

### 1. Clone the Repository
```bash
git clone https://github.com/Raksha-Shetty18/Surplus-Food-Connect.git
cd Surplus-Food-Connect
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Create a `.env` file in the root directory (or copy from `.env.example`):
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 5. Build for Production
```bash
npm run build
```

---

## ☁️ Deployment

### Live URL
* **Vercel:** [https://surplus-food-connect-one.vercel.app/](https://surplus-food-connect-one.vercel.app/)

### Deploying Your Own Copy
* **Vercel:** Import your GitHub repository on [Vercel](https://vercel.com/new) and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in **Environment Variables**.
* **GitHub Pages:** Turn on **Settings > Pages > Source: GitHub Actions**. The included workflow in `.github/workflows/deploy.yml` will automatically build and deploy.
* **Netlify:** Connect your GitHub repository to [Netlify](https://app.netlify.com/start) — `netlify.toml` handles routing automatically.

---

## 👥 Default Demo Accounts

| Role | Email | Password |
| :--- | :--- | :--- |
| **Admin** | `admin@surplus.com` | `admin123` |

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
