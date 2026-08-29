# 🍱 Surplus Food Connect

> **Connecting surplus food with people who need it.**  
> A transparent, verified community platform enabling commercial food donors to allocate bulk surplus meals across multiple receiver NGOs through direct booking requests.

---

## 🌍 Problem & Mission

Every day, restaurants, hotels, and caterers generate large quantities of wholesome surplus food that ends up in landfills, while community shelters and orphanages face meal shortages.

**Surplus Food Connect** solves this by replacing the traditional single-claim model with a **Multi-Receiver Booking & Allocation System**:
* **UN SDG 2:** Zero Hunger
* **UN SDG 12:** Responsible Consumption & Production

---

## ✨ Key Features

### 1. 🛡️ Official Licence & Document Verification
* **Donors** submit official FSSAI licences / business registration details.
* **Receivers** submit registered NGO / trust documentation.
* **Admin Verification Portal**: Admins inspect uploaded licences in a dedicated document viewer modal before approving (`Verified`) or rejecting (`Rejected` with reason).
* **Role-based Restrictions**: Only verified donors can publish food; only verified receivers can submit portion requests.

### 2. 📦 Multi-Receiver Portion Allocation
* Donors post bulk quantities (e.g., 100 meals).
* Multiple NGOs can request customized portions (e.g., 30 meals, 20 meals, 40 meals) from the **same donation concurrently**.
* **Overbooking Protection**: The system dynamically tracks `total_quantity`, `reserved_quantity`, and `available_quantity`, strictly preventing excess allocation.

### 3. 🤝 Transparent Request ➔ Booked ➔ Received Lifecycle
* **Request:** Receiver submits request $\rightarrow$ `Pending` (*"Waiting for donor approval"*).
* **Acceptance:** Donor accepts $\rightarrow$ `Booked` (*Reserved quantity allocated*).
* **Confirmation:** Receiver physically receives food $\rightarrow$ `Received` (*Completed distribution*).
* **Cancellation & Release:** If an accepted booking is cancelled, the reserved meals are immediately released back to `available_quantity` for other receivers.

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

## 🔄 Workflow

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

* **Frontend:** React 19, Vite, JavaScript (ES6+), Vanilla CSS3 (Custom responsive design system).
* **Backend & Database:** Supabase PostgreSQL (ACID relational transactions, parameterized client queries, secure Storage).
* **Build & Tooling:** Vite, Rollup, Git / GitHub.

---

## 📁 Project Structure

```
surplus-food-connect/
├── public/
├── src/
│   ├── App.jsx          # Main application component & state management
│   ├── main.jsx         # React application entrypoint
│   ├── style.css        # Complete CSS design system & responsive styles
│   └── supabase.js      # Supabase PostgreSQL client configuration
├── .env.example         # Template for environment variables
├── .gitignore           # Git ignore file (protects .env)
├── index.html           # HTML5 entrypoint
├── package.json         # Project metadata and dependencies
└── README.md            # Project documentation
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
Create a `.env` file in the root directory:
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

*(You can copy from `.env.example`)*

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

## 👥 Default Admin Account

* **Email:** `admin@surplus.com`
* **Password:** `admin123`
* **Role:** `admin` (Pre-verified)

---

## 📄 License

This project is created for hackathon demonstration and open community food rescue initiatives under the MIT License.
