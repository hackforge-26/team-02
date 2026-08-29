import { useState } from "react";

function App() {
  const [page, setPage] = useState("login");
  const [role, setRole] = useState("donor");

  const [donorData, setDonorData] = useState({
    name: "",
    email: "",
  });

  const [foodForm, setFoodForm] = useState({
    foodName: "",
    category: "Cooked Meal",
    quantity: "",
    preparedAt: "",
    bestBefore: "",
    location: "",
    description: "",
    contact: "",
  });

  const [foods, setFoods] = useState([
    {
      id: 1,
      foodName: "Vegetable Rice & Curry",
      category: "Cooked Meal",
      quantity: "30",
      preparedAt: "11:00 AM",
      bestBefore: "3:00 PM",
      location: "YIT Campus",
      description: "Fresh vegetarian meals",
      contact: "9876543210",
      donor: "Demo Restaurant",
      status: "Available",
    },
    {
      id: 2,
      foodName: "Veg Biryani",
      category: "Cooked Meal",
      quantity: "50",
      preparedAt: "11:30 AM",
      bestBefore: "4:00 PM",
      location: "Mangalore",
      description: "Freshly prepared biryani",
      contact: "9876543211",
      donor: "Royal Hotel",
      status: "Available",
    },
  ]);

  const [claims, setClaims] = useState([]);

  // ---------------- LOGIN ----------------

  const handleLogin = (e) => {
    e.preventDefault();

    if (role === "donor") {
      setPage("donor");
    } else if (role === "receiver") {
      setPage("receiver");
    } else {
      setPage("admin");
    }
  };

  // ---------------- FOOD FORM ----------------

  const handleFoodChange = (e) => {
    setFoodForm({
      ...foodForm,
      [e.target.name]: e.target.value,
    });
  };

  // ---------------- ADD FOOD ----------------

  const addFood = (e) => {
    e.preventDefault();

    if (
      !foodForm.foodName ||
      !foodForm.quantity ||
      !foodForm.bestBefore ||
      !foodForm.location
    ) {
      alert("Please fill all required fields.");
      return;
    }

    const newFood = {
      id: Date.now(),
      ...foodForm,
      donor: donorData.name || "Demo Donor",
      status: "Available",
    };

    setFoods([newFood, ...foods]);

    setFoodForm({
      foodName: "",
      category: "Cooked Meal",
      quantity: "",
      preparedAt: "",
      bestBefore: "",
      location: "",
      description: "",
      contact: "",
    });

    alert("Food donation posted successfully!");
  };

  // ---------------- CLAIM FOOD ----------------

  const claimFood = (food) => {
    if (food.status === "Claimed") {
      return;
    }

    const receiverName = "Hope Community NGO";

    const updatedFoods = foods.map((item) =>
      item.id === food.id
        ? { ...item, status: "Claimed", claimedBy: receiverName }
        : item
    );

    setFoods(updatedFoods);

    const newClaim = {
      id: Date.now(),
      foodName: food.foodName,
      quantity: food.quantity,
      donor: food.donor,
      receiver: receiverName,
      location: food.location,
    };

    setClaims([newClaim, ...claims]);

    alert(`${food.quantity} meals successfully claimed!`);
  };

  // ---------------- LOGOUT ----------------

  const logout = () => {
    setPage("login");
    setRole("donor");
  };

  // ---------------- PRIORITY ----------------

  const getPriority = (food) => {
    if (food.status === "Claimed") {
      return "CLAIMED";
    }

    if (!food.bestBefore) {
      return "MEDIUM";
    }

    const currentHour = new Date().getHours();

    const match = food.bestBefore.match(/(\d+):(\d+)\s*(AM|PM)/i);

    if (!match) {
      return "MEDIUM";
    }

    let hour = parseInt(match[1]);

    const minute = parseInt(match[2]);

    const period = match[3].toUpperCase();

    if (period === "PM" && hour !== 12) {
      hour += 12;
    }

    if (period === "AM" && hour === 12) {
      hour = 0;
    }

    const remaining = hour - currentHour;

    if (remaining <= 2) {
      return "HIGH";
    }

    if (remaining <= 5) {
      return "MEDIUM";
    }

    return "LOW";
  };

  // ---------------- LOGIN PAGE ----------------

  if (page === "login") {
    return (
      <div className="app">
        <div className="login-page">
          <div className="login-brand">
            <div className="brand-icon">🍱</div>

            <h1>Surplus Food Connect</h1>

            <p>Turn Excess into Access</p>

            <div className="login-info">
              <div>
                <span>🍽️</span>
                <p>Rescue Surplus Food</p>
              </div>

              <div>
                <span>🤝</span>
                <p>Connect with Receivers</p>
              </div>

              <div>
                <span>🌱</span>
                <p>Reduce Food Waste</p>
              </div>
            </div>
          </div>

          <div className="login-card">
            <h2>Welcome Back</h2>

            <p className="login-subtitle">
              Sign in to continue to your dashboard
            </p>

            <form onSubmit={handleLogin}>
              <label>Email Address</label>

              <input
                type="email"
                placeholder="Enter your email"
                value={donorData.email}
                onChange={(e) =>
                  setDonorData({
                    ...donorData,
                    email: e.target.value,
                  })
                }
                required
              />

              <label>Password</label>

              <input
                type="password"
                placeholder="Enter your password"
                required
              />

              <label>Select Role</label>

              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="donor">Donor</option>
                <option value="receiver">Receiver</option>
                <option value="admin">Admin</option>
              </select>

              {role === "donor" && (
                <>
                  <label>Your Name / Organization</label>

                  <input
                    type="text"
                    placeholder="Restaurant / Hotel / Individual"
                    value={donorData.name}
                    onChange={(e) =>
                      setDonorData({
                        ...donorData,
                        name: e.target.value,
                      })
                    }
                    required
                  />
                </>
              )}

              <button className="primary-btn" type="submit">
                Login →
              </button>
            </form>

            <p className="demo-text">
              Demo project • Authentication simulation
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---------------- DONOR DASHBOARD ----------------

  if (page === "donor") {
    const myFoods = foods.filter(
      (food) => food.donor === (donorData.name || "Demo Donor")
    );

    const claimedCount = myFoods.filter(
      (food) => food.status === "Claimed"
    ).length;

    const totalMeals = myFoods.reduce(
      (sum, food) => sum + Number(food.quantity || 0),
      0
    );

    return (
      <div className="dashboard">
        <Header
          title="Donor Dashboard"
          subtitle="Share surplus food with people who need it"
          onLogout={logout}
        />

        <main className="dashboard-content">
          <div className="welcome-section">
            <div>
              <p className="eyebrow">DONOR PORTAL</p>
              <h2>Welcome, {donorData.name || "Donor"} 👋</h2>
              <p>
                Your surplus food can become someone's next meal.
              </p>
            </div>

            <button
              className="primary-btn"
              onClick={() => setPage("donate")}
            >
              + Donate Food
            </button>
          </div>

          <div className="stats-grid">
            <StatCard
              icon="🍱"
              title="Food Donations"
              value={myFoods.length}
            />

            <StatCard
              icon="🤝"
              title="Claimed"
              value={claimedCount}
            />

            <StatCard
              icon="🍽️"
              title="Meals Shared"
              value={totalMeals}
            />

            <StatCard
              icon="🌱"
              title="Impact"
              value={`${totalMeals} meals`}
            />
          </div>

          <section className="content-card">
            <div className="section-header">
              <div>
                <h3>My Donations</h3>
                <p>Track your surplus food contributions</p>
              </div>

              <button
                className="outline-btn"
                onClick={() => setPage("donate")}
              >
                + New Donation
              </button>
            </div>

            {myFoods.length === 0 ? (
              <EmptyState message="You haven't posted any food yet." />
            ) : (
              <FoodTable foods={myFoods} getPriority={getPriority} />
            )}
          </section>
        </main>
      </div>
    );
  }

  // ---------------- DONATE PAGE ----------------

  if (page === "donate") {
    return (
      <div className="dashboard">
        <Header
          title="Donate Surplus Food"
          subtitle="Provide details about the food you want to share"
          onLogout={logout}
        />

        <main className="dashboard-content">
          <button
            className="back-btn"
            onClick={() => setPage("donor")}
          >
            ← Back to Dashboard
          </button>

          <section className="form-card">
            <div className="form-heading">
              <div className="form-icon">🍱</div>

              <div>
                <h2>Food Donation Details</h2>
                <p>
                  Please provide accurate information so receivers
                  can safely collect the food.
                </p>
              </div>
            </div>

            <form onSubmit={addFood}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Food Name *</label>

                  <input
                    name="foodName"
                    value={foodForm.foodName}
                    onChange={handleFoodChange}
                    placeholder="e.g. Vegetable Rice & Curry"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Food Category</label>

                  <select
                    name="category"
                    value={foodForm.category}
                    onChange={handleFoodChange}
                  >
                    <option>Cooked Meal</option>
                    <option>Rice</option>
                    <option>Chapati / Bread</option>
                    <option>Fruits</option>
                    <option>Vegetables</option>
                    <option>Packaged Food</option>
                    <option>Other</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Quantity *</label>

                  <input
                    name="quantity"
                    type="number"
                    min="1"
                    value={foodForm.quantity}
                    onChange={handleFoodChange}
                    placeholder="Number of meals"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Prepared At</label>

                  <input
                    name="preparedAt"
                    type="time"
                    value={foodForm.preparedAt}
                    onChange={handleFoodChange}
                  />
                </div>

                <div className="form-group">
                  <label>Best Before *</label>

                  <input
                    name="bestBefore"
                    type="time"
                    value={foodForm.bestBefore}
                    onChange={handleFoodChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Contact Number</label>

                  <input
                    name="contact"
                    value={foodForm.contact}
                    onChange={handleFoodChange}
                    placeholder="Phone number"
                  />
                </div>

                <div className="form-group full-width">
                  <label>Pickup Location *</label>

                  <input
                    name="location"
                    value={foodForm.location}
                    onChange={handleFoodChange}
                    placeholder="e.g. YIT Campus, Mangalore"
                    required
                  />
                </div>

                <div className="form-group full-width">
                  <label>Description</label>

                  <textarea
                    name="description"
                    value={foodForm.description}
                    onChange={handleFoodChange}
                    placeholder="Add details about the food..."
                    rows="4"
                  />
                </div>
              </div>

              <div className="ai-preview">
                <span>🤖</span>

                <div>
                  <strong>AI Food Rescue Analysis</strong>

                  <p>
                    After posting, the system will prioritize
                    donations based on their remaining usable time.
                  </p>
                </div>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="outline-btn"
                  onClick={() => setPage("donor")}
                >
                  Cancel
                </button>

                <button type="submit" className="primary-btn">
                  Post Surplus Food →
                </button>
              </div>
            </form>
          </section>
        </main>
      </div>
    );
  }

  // ---------------- RECEIVER DASHBOARD ----------------

  if (page === "receiver") {
    const availableFoods = foods.filter(
      (food) => food.status === "Available"
    );

    const claimedFoods = foods.filter(
      (food) =>
        food.status === "Claimed" &&
        food.claimedBy === "Hope Community NGO"
    );

    return (
      <div className="dashboard">
        <Header
          title="Receiver Dashboard"
          subtitle="Find and rescue available surplus food"
          onLogout={logout}
        />

        <main className="dashboard-content">
          <div className="welcome-section">
            <div>
              <p className="eyebrow">RECEIVER PORTAL</p>
              <h2>Welcome, Hope Community NGO 🤝</h2>
              <p>
                Find available food donations and claim them for
                your community.
              </p>
            </div>
          </div>

          <div className="stats-grid">
            <StatCard
              icon="🍱"
              title="Available Donations"
              value={availableFoods.length}
            />

            <StatCard
              icon="🤝"
              title="My Claims"
              value={claimedFoods.length}
            />

            <StatCard
              icon="🍽️"
              title="Meals Received"
              value={claimedFoods.reduce(
                (sum, food) => sum + Number(food.quantity || 0),
                0
              )}
            />
          </div>

          <section>
            <div className="section-title">
              <p className="eyebrow">AVAILABLE NOW</p>
              <h2>Surplus Food Near You</h2>
              <p>Claim food before it becomes waste.</p>
            </div>

            {availableFoods.length === 0 ? (
              <EmptyState message="No surplus food is currently available." />
            ) : (
              <div className="food-grid">
                {availableFoods.map((food) => (
                  <FoodCard
                    key={food.id}
                    food={food}
                    priority={getPriority(food)}
                    onClaim={() => claimFood(food)}
                  />
                ))}
              </div>
            )}
          </section>

          {claimedFoods.length > 0 && (
            <section className="content-card">
              <div className="section-header">
                <div>
                  <h3>My Claimed Food</h3>
                  <p>Food you have successfully rescued</p>
                </div>
              </div>

              <FoodTable
                foods={claimedFoods}
                getPriority={getPriority}
              />
            </section>
          )}
        </main>
      </div>
    );
  }

  // ---------------- ADMIN DASHBOARD ----------------

  if (page === "admin") {
    const totalMeals = foods.reduce(
      (sum, food) => sum + Number(food.quantity || 0),
      0
    );

    const claimedMeals = foods
      .filter((food) => food.status === "Claimed")
      .reduce(
        (sum, food) => sum + Number(food.quantity || 0),
        0
      );

    const availableMeals = foods
      .filter((food) => food.status === "Available")
      .reduce(
        (sum, food) => sum + Number(food.quantity || 0),
        0
      );

    return (
      <div className="dashboard">
        <Header
          title="Admin Dashboard"
          subtitle="Monitor the complete food rescue network"
          onLogout={logout}
        />

        <main className="dashboard-content">
          <div className="welcome-section">
            <div>
              <p className="eyebrow">ADMIN CONTROL CENTER</p>
              <h2>System Overview 📊</h2>
              <p>
                Monitor donations, claims and the impact created
                through Surplus Food Connect.
              </p>
            </div>

            <div className="live-status">
              <span></span>
              System Live
            </div>
          </div>

          <div className="stats-grid admin-stats">
            <StatCard
              icon="🏪"
              title="Total Donors"
              value="24"
            />

            <StatCard
              icon="🤝"
              title="Receivers"
              value="18"
            />

            <StatCard
              icon="🍱"
              title="Total Donations"
              value={foods.length}
            />

            <StatCard
              icon="🍽️"
              title="Meals Rescued"
              value={claimedMeals}
            />
          </div>

          <div className="impact-card">
            <div>
              <span className="impact-icon">🌱</span>

              <div>
                <p>Total Food Rescued</p>
                <h2>{claimedMeals} Meals</h2>
              </div>
            </div>

            <div className="impact-message">
              Every rescued meal means one less meal wasted.
            </div>
          </div>

          <div className="admin-grid">
            <section className="content-card">
              <div className="section-header">
                <div>
                  <h3>All Donations</h3>
                  <p>Complete donation activity</p>
                </div>

                <span className="count-badge">
                  {foods.length} Records
                </span>
              </div>

              <FoodTable foods={foods} getPriority={getPriority} />
            </section>

            <section className="content-card">
              <div className="section-header">
                <div>
                  <h3>Recent Claims</h3>
                  <p>Food successfully rescued</p>
                </div>
              </div>

              {claims.length === 0 ? (
                <EmptyState message="No claims yet." />
              ) : (
                <div className="claim-list">
                  {claims.map((claim) => (
                    <div className="claim-item" key={claim.id}>
                      <div className="claim-icon">🤝</div>

                      <div>
                        <strong>{claim.foodName}</strong>

                        <p>
                          {claim.quantity} meals • {claim.receiver}
                        </p>
                      </div>

                      <span className="status claimed">
                        CLAIMED
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="content-card">
            <div className="section-header">
              <div>
                <h3>Network Summary</h3>
                <p>Current food availability</p>
              </div>
            </div>

            <div className="summary-grid">
              <div className="summary-item">
                <span>🟢</span>

                <div>
                  <strong>{availableMeals}</strong>
                  <p>Meals Available</p>
                </div>
              </div>

              <div className="summary-item">
                <span>🔵</span>

                <div>
                  <strong>{claimedMeals}</strong>
                  <p>Meals Claimed</p>
                </div>
              </div>

              <div className="summary-item">
                <span>🍽️</span>

                <div>
                  <strong>{totalMeals}</strong>
                  <p>Total Meals Listed</p>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return null;
}

// ---------------- HEADER ----------------

function Header({ title, subtitle, onLogout }) {
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <div className="small-logo">🍱</div>

        <div>
          <h1>Surplus Food Connect</h1>
          <p>{title}</p>
        </div>
      </div>

      <div className="topbar-right">
        <div className="online-indicator">
          <span></span>
          Online
        </div>

        <button className="logout-btn" onClick={onLogout}>
          Logout
        </button>
      </div>
    </header>
  );
}

// ---------------- STAT CARD ----------------

function StatCard({ icon, title, value }) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon}</div>

      <div>
        <p>{title}</p>
        <h3>{value}</h3>
      </div>
    </div>
  );
}

// ---------------- FOOD CARD ----------------

function FoodCard({ food, priority, onClaim }) {
  return (
    <div className="food-card">
      <div className="food-card-top">
        <div className="food-image">🍛</div>

        <span className={`priority ${priority.toLowerCase()}`}>
          {priority === "HIGH" && "🔥 "}
          {priority}
        </span>
      </div>

      <h3>{food.foodName}</h3>

      <p className="food-description">
        {food.description || "Fresh surplus food available for rescue."}
      </p>

      <div className="food-details">
        <div>
          <span>🍽️</span>
          <p>
            <strong>{food.quantity}</strong> meals
          </p>
        </div>

        <div>
          <span>📍</span>
          <p>{food.location}</p>
        </div>

        <div>
          <span>⏰</span>
          <p>
            Before <strong>{food.bestBefore}</strong>
          </p>
        </div>
      </div>

      <div className="donor-info">
        <span>Donated by</span>
        <strong>{food.donor}</strong>
      </div>

      <button className="claim-btn" onClick={onClaim}>
        Rescue This Food →
      </button>
    </div>
  );
}

// ---------------- FOOD TABLE ----------------

function FoodTable({ foods, getPriority }) {
  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Food</th>
            <th>Quantity</th>
            <th>Location</th>
            <th>Best Before</th>
            <th>Priority</th>
            <th>Status</th>
          </tr>
        </thead>

        <tbody>
          {foods.map((food) => {
            const priority = getPriority(food);

            return (
              <tr key={food.id}>
                <td>
                  <div className="table-food">
                    <span>🍛</span>

                    <div>
                      <strong>{food.foodName}</strong>
                      <small>{food.donor}</small>
                    </div>
                  </div>
                </td>

                <td>{food.quantity} meals</td>

                <td>📍 {food.location}</td>

                <td>⏰ {food.bestBefore}</td>

                <td>
                  <span
                    className={`priority ${priority.toLowerCase()}`}
                  >
                    {priority}
                  </span>
                </td>

                <td>
                  <span
                    className={`status ${food.status.toLowerCase()}`}
                  >
                    {food.status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------- EMPTY STATE ----------------

function EmptyState({ message }) {
  return (
    <div className="empty-state">
      <div>🍱</div>
      <h3>Nothing here yet</h3>
      <p>{message}</p>
    </div>
  );
}

export default App;
