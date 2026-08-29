import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "./supabase.js";

// =========================================================================
// HELPER FUNCTIONS & UTILITIES
// =========================================================================

// Parse role and verification status safely
function getUserRoleAndStatus(user) {
  if (!user) return { role: "", status: "Pending", note: "" };
  const baseRole = String(user.role || "").split("|")[0].toLowerCase();
  if (baseRole === "admin") {
    return { role: "admin", status: "Verified", note: "" };
  }
  
  // Check verification store
  try {
    const localVerifications = JSON.parse(localStorage.getItem("surplus_verifications") || "{}");
    const profiles = JSON.parse(localStorage.getItem("surplus_verification_profiles") || "{}");
    const userProf = profiles[user.id] || {};
    
    const status = user.verification_status || localVerifications[user.id] || userProf.status || "Pending";
    const note = user.verification_note || userProf.rejection_reason || "";
    
    return { role: baseRole, status, note };
  } catch (e) {
    return { role: baseRole, status: "Pending", note: "" };
  }
}

// Convert local time strings to standard ISO for PostgreSQL
function formatTimeToISO(timeStr) {
  if (!timeStr) return null;
  const str = String(timeStr).trim();

  if (str.includes("T") || !isNaN(Date.parse(str))) {
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }

  const match = str.match(/^(\d{1,2}):(\d{2})(\s*(AM|PM))?$/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const period = match[4]?.toUpperCase();
    if (period === "PM" && hours < 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date.toISOString();
  }

  return new Date().toISOString();
}

// Display formatted time to users
function formatTimeDisplay(isoOrStr) {
  if (!isoOrStr) return "N/A";
  try {
    const d = new Date(isoOrStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
  } catch (e) {
    // fallback
  }
  return String(isoOrStr);
}

// Format date & time for tables & logs
function formatDateTimeDisplay(isoOrStr) {
  if (!isoOrStr) return "Recently";
  try {
    const d = new Date(isoOrStr);
    if (!isNaN(d.getTime())) {
      return `${d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}, ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    }
  } catch (e) {
    // fallback
  }
  return String(isoOrStr);
}

// Extract numeric quantity
function parseQuantityNumber(qtyStr) {
  if (!qtyStr) return 0;
  const match = String(qtyStr).match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

// Location matching helper
function getLocationRelationship(donorLoc, receiverLoc) {
  if (!donorLoc || !receiverLoc) return "Other Area";
  const d = donorLoc.toLowerCase().trim();
  const r = receiverLoc.toLowerCase().trim();

  if (d === r || d.includes(r) || r.includes(d)) {
    return "Same Area";
  }

  const dTokens = d.split(/[,\s]+/);
  const rTokens = r.split(/[,\s]+/);
  const common = dTokens.filter((token) => token.length > 2 && rTokens.includes(token));

  if (common.length > 0) {
    return "Nearby";
  }
  return "Other Area";
}

// Trigger CSV File Download
function triggerCSVDownload(filename, csvContent) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeCSV(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

// =========================================================================
// MAIN APP COMPONENT
// =========================================================================

function App() {
  // ---------------- DATABASE CONNECTION STATUS ----------------
  const [dbStatus, setDbStatus] = useState("Connecting to database...");

  useEffect(() => {
    async function testSupabaseConnection() {
      try {
        const { data, error } = await supabase
          .from("food_donations")
          .select("id")
          .limit(1);

        if (error) {
          setDbStatus("Database Connection Failed");
        } else {
          setDbStatus("Database Connected");
        }
      } catch (err) {
        setDbStatus("Database Connection Failed");
      }
    }

    testSupabaseConnection();
  }, []);

  // ---------------- USER AUTHENTICATION STATE ----------------
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem("surplusUser");
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error("Error reading surplusUser", e);
    }
    return null;
  });

  const [page, setPage] = useState(() => {
    try {
      const saved = localStorage.getItem("surplusUser");
      if (saved) {
        const user = JSON.parse(saved);
        if (user && user.role) {
          const { role } = getUserRoleAndStatus(user);
          return role || "landing";
        }
      }
    } catch (e) {
      console.error("Error reading initial page", e);
    }
    return "landing";
  });

  // Auth View Mode: "signin" (Email+Password only) or "register" (Full registration form)
  const [authMode, setAuthMode] = useState("signin");

  // Sign In Form (ONLY Email & Password)
  const [signInForm, setSignInForm] = useState({
    email: "",
    password: "",
  });
  const [signInError, setSignInError] = useState("");
  const [signInSuccess, setSignInSuccess] = useState("");
  const [signInLoading, setSignInLoading] = useState(false);

  // Registration Form (Full Registration with Role tabs, Licence upload, etc.)
  const [regRole, setRegRole] = useState("donor");
  const [regForm, setRegForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    address: "",
    org_type: "Restaurant",
    registration_number: "",
    document_name: "",
    document_data: "",
  });
  const [regError, setRegError] = useState("");
  const [regSuccess, setRegSuccess] = useState("");
  const [regLoading, setRegLoading] = useState(false);

  // ---------------- DONOR DASHBOARD STATE ----------------
  const [donorDonations, setDonorDonations] = useState([]);
  const [loadingDonations, setLoadingDonations] = useState(false);
  const [donationsError, setDonationsError] = useState("");

  const [donationForm, setDonationForm] = useState({
    food_name: "",
    category: "Cooked Meal",
    quantity: "",
    prepared_at: "",
    best_before: "",
    location: "",
    description: "",
    contact: "",
  });
  const [donationPosting, setDonationPosting] = useState(false);
  const [donationError, setDonationError] = useState("");
  const [donationSuccess, setDonationSuccess] = useState("");

  // ---------------- MULTI-RECEIVER REQUESTS STATE ----------------
  const [foodRequests, setFoodRequests] = useState(() => {
    try {
      const saved = localStorage.getItem("surplus_food_requests");
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // ---------------- RECEIVER DASHBOARD STATE ----------------
  const [availableFoods, setAvailableFoods] = useState([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [availableError, setAvailableError] = useState("");

  // Filters for Receiver
  const [filterLocation, setFilterLocation] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");
  const [filterMaxQty, setFilterMaxQty] = useState("");

  // Booking Request Modal State
  const [requestModalFood, setRequestModalFood] = useState(null);
  const [requestForm, setRequestForm] = useState({
    requested_quantity: "",
    message: "",
  });
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [requestSuccess, setRequestSuccess] = useState("");

  // ---------------- ADMIN DASHBOARD STATE ----------------
  const [adminTab, setAdminTab] = useState("overview"); // overview | verification | donations | requests | bookings | users | reports
  const [adminDonations, setAdminDonations] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [adminRefreshing, setAdminRefreshing] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [adminSuccess, setAdminSuccess] = useState("");

  // Admin Document Viewer & Rejection Modal State
  const [viewingDocUser, setViewingDocUser] = useState(null);
  const [rejectReasonInput, setRejectReasonInput] = useState("");
  const [showRejectPromptForUser, setShowRejectPromptForUser] = useState(null);

  // Sync Food Requests to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("surplus_food_requests", JSON.stringify(foodRequests));
    } catch (e) {}
  }, [foodRequests]);

  // ---------------- DYNAMIC QUANTITY & STATUS CALCULATION ----------------
  // Computes total_quantity, reserved_quantity, received_quantity, available_quantity, and status for each food donation
  const getDonationAllocation = useCallback(
    (donationId, originalQtyStr) => {
      const total_quantity = parseQuantityNumber(originalQtyStr);
      
      const relatedRequests = foodRequests.filter((r) => r.food_id === donationId);
      
      // Reserved: requests accepted by donor but not yet completed
      const reservedRequests = relatedRequests.filter((r) => r.status === "Accepted");
      const reserved_quantity = reservedRequests.reduce(
        (sum, r) => sum + Number(r.requested_quantity || 0),
        0
      );
      
      // Received: completed distributions
      const receivedRequests = relatedRequests.filter((r) => r.status === "Received");
      const received_quantity = receivedRequests.reduce(
        (sum, r) => sum + Number(r.requested_quantity || 0),
        0
      );

      const allocated_quantity = reserved_quantity + received_quantity;
      const available_quantity = Math.max(0, total_quantity - allocated_quantity);

      // Determine precise food status
      let computedStatus = "Available";
      if (total_quantity > 0 && available_quantity === 0) {
        if (reserved_quantity === 0 && received_quantity >= total_quantity) {
          computedStatus = "Completed";
        } else {
          computedStatus = "Fully Booked";
        }
      } else if (reserved_quantity > 0) {
        computedStatus = "Partially Booked";
      }

      return {
        total_quantity,
        reserved_quantity,
        received_quantity,
        available_quantity,
        computedStatus,
      };
    },
    [foodRequests]
  );

  // ---------------- FETCH DONOR'S DONATIONS ----------------
  const fetchDonorDonations = useCallback(
    async (userId) => {
      const idToFetch = userId || currentUser?.id;
      if (!idToFetch) return;

      setLoadingDonations(true);
      setDonationsError("");

      try {
        const { data, error } = await supabase
          .from("food_donations")
          .select("*")
          .eq("donor_id", idToFetch)
          .order("created_at", { ascending: false });

        if (error) {
          setDonationsError("Unable to load your donations.");
        } else {
          setDonorDonations(data || []);
        }
      } catch (err) {
        setDonationsError("Unable to load your donations.");
      } finally {
        setLoadingDonations(false);
      }
    },
    [currentUser?.id]
  );

  // ---------------- FETCH AVAILABLE FOOD FOR RECEIVERS ----------------
  const fetchAvailableFoods = useCallback(async () => {
    setLoadingAvailable(true);
    setAvailableError("");

    try {
      const [foodsRes, usersRes] = await Promise.all([
        supabase.from("food_donations").select("*").order("created_at", { ascending: false }),
        supabase.from("users").select("id, name, email, role"),
      ]);

      if (foodsRes.error) {
        setAvailableError("Unable to load available food.");
      } else {
        const usersMap = {};
        (usersRes.data || []).forEach((u) => {
          usersMap[u.id] = u;
        });

        const enrichedFoods = (foodsRes.data || []).map((f) => ({
          ...f,
          donor: usersMap[f.donor_id] || { name: "Verified Food Donor" },
        }));

        setAvailableFoods(enrichedFoods);
      }
    } catch (err) {
      setAvailableError("Unable to load available food.");
    } finally {
      setLoadingAvailable(false);
    }
  }, []);

  // ---------------- FETCH ALL ADMIN DATA ----------------
  const fetchAdminData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setAdminRefreshing(true);
    } else {
      setLoadingAdmin(true);
    }
    setAdminError("");

    try {
      const [donationsRes, usersRes] = await Promise.all([
        supabase.from("food_donations").select("*").order("created_at", { ascending: false }),
        supabase.from("users").select("*").order("created_at", { ascending: false }),
      ]);

      const usersList = usersRes.data || [];
      const usersMap = {};
      usersList.forEach((u) => {
        usersMap[u.id] = u;
      });

      const rawDonations = donationsRes.data || [];
      const donationsList = rawDonations.map((d) => ({
        ...d,
        donor: usersMap[d.donor_id] || { name: "N/A", email: "" },
      }));

      setAdminUsers(usersList);
      setAdminDonations(donationsList);
    } catch (err) {
      setAdminError("Unable to load dashboard data. Please try again.");
    } finally {
      setLoadingAdmin(false);
      setAdminRefreshing(false);
    }
  }, []);

  // ---------------- ROUTING EFFECT ----------------
  useEffect(() => {
    if (page === "landing" || page === "login") return;

    if (!currentUser) {
      setPage("landing");
      return;
    }

    const { role: currentRole } = getUserRoleAndStatus(currentUser);

    if (page === "admin" && currentRole !== "admin") {
      setPage(currentRole || "landing");
      return;
    }

    if (page === "donor") {
      fetchDonorDonations(currentUser.id);
    } else if (page === "receiver") {
      fetchAvailableFoods();
    } else if (page === "admin" && currentRole === "admin") {
      fetchAdminData();
    }
  }, [page, currentUser, fetchDonorDonations, fetchAvailableFoods, fetchAdminData]);

  // =========================================================================
  // AUTHENTICATION: SIGN IN (EMAIL + PASSWORD ONLY)
  // =========================================================================

  const handleSignIn = async (e) => {
    e.preventDefault();
    setSignInError("");
    setSignInSuccess("");

    const emailTrimmed = signInForm.email.trim().toLowerCase();
    const password = signInForm.password;

    if (!emailTrimmed) {
      setSignInError("Please enter your email address.");
      return;
    }
    if (!password) {
      setSignInError("Please enter your password.");
      return;
    }

    setSignInLoading(true);

    try {
      // 1. Search existing users table by email ONLY
      const { data: users, error: fetchError } = await supabase
        .from("users")
        .select("*")
        .eq("email", emailTrimmed);

      if (fetchError) {
        setSignInError(`Database error: ${fetchError.message}`);
        setSignInLoading(false);
        return;
      }

      if (!users || users.length === 0) {
        setSignInError("No account found with this email address. Please register first.");
        setSignInLoading(false);
        return;
      }

      const user = users[0];

      // 2. Verify password
      if (user.password !== password) {
        setSignInError("Incorrect password. Please check your credentials.");
        setSignInLoading(false);
        return;
      }

      // 3. Read role directly from database record
      const { role: detectedRole } = getUserRoleAndStatus(user);

      setSignInSuccess("Sign in successful!");
      setCurrentUser(user);
      localStorage.setItem("surplusUser", JSON.stringify(user));

      // 4. Automatically redirect based on database role
      setTimeout(() => {
        setPage(detectedRole || "landing");
        setSignInLoading(false);
      }, 400);
    } catch (err) {
      setSignInError(`Unexpected error: ${err.message || "Failed to sign in."}`);
      setSignInLoading(false);
    }
  };

  // =========================================================================
  // AUTHENTICATION: REGISTRATION (DONOR / RECEIVER WITH DOCUMENT UPLOAD)
  // =========================================================================

  const handleRegInputChange = (e) => {
    setRegError("");
    setRegSuccess("");
    setRegForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setRegForm((prev) => ({
        ...prev,
        document_name: file.name,
        document_data: event.target.result,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setRegError("");
    setRegSuccess("");

    const nameTrimmed = regForm.name.trim();
    const emailTrimmed = regForm.email.trim().toLowerCase();
    const password = regForm.password;

    if (!nameTrimmed) {
      setRegError(`Please enter your organization / ${regRole === "donor" ? "business" : "NGO"} name.`);
      return;
    }
    if (!emailTrimmed) {
      setRegError("Please enter your email address.");
      return;
    }
    if (!password) {
      setRegError("Please enter a password.");
      return;
    }
    if (!regForm.registration_number.trim()) {
      setRegError(
        `Please provide your official ${regRole === "donor" ? "FSSAI / Business Licence" : "NGO Registration"} Number.`
      );
      return;
    }

    if (regRole === "admin") {
      setRegError("Admin accounts cannot be self-registered.");
      return;
    }

    setRegLoading(true);

    try {
      // Check if email already registered
      const { data: existingUsers } = await supabase
        .from("users")
        .select("id")
        .eq("email", emailTrimmed);

      if (existingUsers && existingUsers.length > 0) {
        setRegError("An account with this email already exists. Please Sign In.");
        setRegLoading(false);
        return;
      }

      // Create new user in users table with role
      const { data: newUser, error: insertError } = await supabase
        .from("users")
        .insert([
          {
            name: nameTrimmed,
            email: emailTrimmed,
            password: password,
            role: regRole.toLowerCase(),
          },
        ])
        .select()
        .single();

      if (insertError) {
        setRegError(`Registration error: ${insertError.message}`);
        setRegLoading(false);
        return;
      }

      // Save detailed verification profile into verification store
      const verificationProfiles = JSON.parse(
        localStorage.getItem("surplus_verification_profiles") || "{}"
      );
      verificationProfiles[newUser.id] = {
        userId: newUser.id,
        name: nameTrimmed,
        email: emailTrimmed,
        phone: regForm.phone.trim() || "Not Provided",
        address: regForm.address.trim() || "Local Area",
        role: regRole.toLowerCase(),
        org_type: regForm.org_type || "Other",
        registration_number: regForm.registration_number.trim(),
        document_name: regForm.document_name || "Official_Registration_Doc.pdf",
        document_data: regForm.document_data || "",
        submitted_at: new Date().toISOString(),
        status: "Pending",
      };
      localStorage.setItem(
        "surplus_verification_profiles",
        JSON.stringify(verificationProfiles)
      );

      // Default status to Pending
      const verifications = JSON.parse(localStorage.getItem("surplus_verifications") || "{}");
      verifications[newUser.id] = "Pending";
      localStorage.setItem("surplus_verifications", JSON.stringify(verifications));

      setRegSuccess("Account registered! Awaiting administrator licence verification.");
      setCurrentUser(newUser);
      localStorage.setItem("surplusUser", JSON.stringify(newUser));

      setTimeout(() => {
        setPage(regRole.toLowerCase());
        setRegLoading(false);
      }, 500);
    } catch (err) {
      setRegError(`Unexpected error: ${err.message || "Failed to register."}`);
      setRegLoading(false);
    }
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem("surplusUser");
    setPage("landing");
    setSignInForm({ email: "", password: "" });
    setSignInError("");
    setSignInSuccess("");
    setRegForm({
      name: "",
      email: "",
      password: "",
      phone: "",
      address: "",
      org_type: "Restaurant",
      registration_number: "",
      document_name: "",
      document_data: "",
    });
    setRegError("");
    setRegSuccess("");
    setDonorDonations([]);
    setDonationError("");
    setDonationSuccess("");
    setAvailableFoods([]);
    setAdminDonations([]);
    setAdminUsers([]);
    setAdminError("");
    setAdminSuccess("");
    setRequestModalFood(null);
  };

  // ---------------- DONATION POSTING HANDLERS ----------------

  const handleDonationInputChange = (e) => {
    setDonationError("");
    setDonationSuccess("");
    setDonationForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleDonateSubmit = async (e) => {
    e.preventDefault();
    setDonationError("");
    setDonationSuccess("");

    const { status: verificationStatus } = getUserRoleAndStatus(currentUser);

    if (verificationStatus !== "Verified") {
      setDonationError("Your account is awaiting admin verification. You will be able to publish food once verified.");
      return;
    }

    if (!donationForm.food_name.trim()) {
      setDonationError("Please enter the food name.");
      return;
    }
    if (!donationForm.quantity.trim()) {
      setDonationError("Please specify the total quantity (e.g. 100 meals).");
      return;
    }
    if (!donationForm.best_before.trim()) {
      setDonationError("Please provide a Best Before time.");
      return;
    }
    if (!donationForm.location.trim()) {
      setDonationError("Please specify the pickup location.");
      return;
    }

    if (!currentUser?.id) {
      setDonationError("Unable to identify logged-in donor session. Please log in again.");
      return;
    }

    setDonationPosting(true);

    try {
      const newDonationRecord = {
        donor_id: currentUser.id,
        food_name: donationForm.food_name.trim(),
        category: donationForm.category || "Cooked Meal",
        quantity: donationForm.quantity.trim(),
        prepared_at: formatTimeToISO(donationForm.prepared_at),
        best_before: formatTimeToISO(donationForm.best_before),
        location: donationForm.location.trim(),
        description: donationForm.description.trim() || "",
        contact: donationForm.contact.trim() || "",
        status: "Available",
      };

      const { error } = await supabase
        .from("food_donations")
        .insert([newDonationRecord]);

      if (error) {
        setDonationError("Unable to post donation. Please try again.");
        setDonationPosting(false);
        return;
      }

      setDonationSuccess("Food donation posted successfully! Receivers can now send booking requests.");
      setDonationForm({
        food_name: "",
        category: "Cooked Meal",
        quantity: "",
        prepared_at: "",
        best_before: "",
        location: "",
        description: "",
        contact: "",
      });

      await fetchDonorDonations(currentUser.id);
    } catch (err) {
      setDonationError("Unable to post donation. Please try again.");
    } finally {
      setDonationPosting(false);
    }
  };

  // ---------------- RECEIVER BOOKING REQUEST HANDLERS ----------------

  const openRequestModal = (food) => {
    setRequestError("");
    setRequestSuccess("");
    const alloc = getDonationAllocation(food.id, food.quantity);

    if (alloc.available_quantity <= 0) {
      alert("Sorry, this food donation is already fully booked.");
      return;
    }

    setRequestModalFood(food);
    setRequestForm({
      requested_quantity: Math.min(25, alloc.available_quantity).toString(),
      message: `We require food for ${Math.min(25, alloc.available_quantity)} people`,
    });
  };

  const handleRequestSubmit = (e) => {
    e.preventDefault();
    setRequestError("");
    setRequestSuccess("");

    const { status: receiverStatus } = getUserRoleAndStatus(currentUser);
    if (receiverStatus !== "Verified") {
      setRequestError("Your account is awaiting admin verification. You will be able to send requests once verified.");
      return;
    }

    const requestedQtyNum = parseInt(requestForm.requested_quantity, 10);
    if (isNaN(requestedQtyNum) || requestedQtyNum <= 0) {
      setRequestError("Please enter a valid requested quantity (positive integer).");
      return;
    }

    const alloc = getDonationAllocation(requestModalFood.id, requestModalFood.quantity);
    if (requestedQtyNum > alloc.available_quantity) {
      setRequestError(
        `Only ${alloc.available_quantity} meals are currently available. You cannot request ${requestedQtyNum} meals.`
      );
      return;
    }

    setRequestSubmitting(true);

    try {
      const newRequest = {
        id: Date.now(),
        food_id: requestModalFood.id,
        food_name: requestModalFood.food_name,
        category: requestModalFood.category,
        donor_id: requestModalFood.donor_id,
        donor_name: requestModalFood.donor?.name || "Food Donor",
        donor_location: requestModalFood.location,
        receiver_id: currentUser.id,
        receiver_name: currentUser.name || "Community Receiver",
        receiver_email: currentUser.email,
        requested_quantity: requestedQtyNum,
        message: requestForm.message.trim() || `Food requirement for ${requestedQtyNum} people`,
        requested_at: new Date().toISOString(),
        status: "Pending", // Pending | Accepted | Declined | Cancelled | Received
        donor_response_at: null,
        receiver_response_at: null,
      };

      setFoodRequests((prev) => [newRequest, ...prev]);
      setRequestSuccess("Request sent. Waiting for donor approval.");
      setTimeout(() => {
        setRequestModalFood(null);
      }, 1000);
    } catch (err) {
      setRequestError("Failed to submit request. Please try again.");
    } finally {
      setRequestSubmitting(false);
    }
  };

  // ---------------- DONOR REQUEST ACCEPT / DECLINE ----------------

  const handleAcceptRequest = (req) => {
    const food = donorDonations.find((d) => d.id === req.food_id);
    const alloc = getDonationAllocation(req.food_id, food ? food.quantity : 100);

    // 1. Strict Overbooking Check
    if (req.requested_quantity > alloc.available_quantity) {
      alert(
        `⚠️ Insufficient quantity available. Only ${alloc.available_quantity} meals remain available. This request cannot be accepted for ${req.requested_quantity} meals.`
      );
      return;
    }

    // 2. Change request status to Accepted (Booked)
    setFoodRequests((prev) =>
      prev.map((r) =>
        r.id === req.id
          ? {
              ...r,
              status: "Accepted",
              donor_response_at: new Date().toISOString(),
            }
          : r
      )
    );

    // 3. Update Supabase donation status
    const remainingAfter = alloc.available_quantity - req.requested_quantity;
    const newDonationStatus = remainingAfter === 0 ? "Fully Booked" : "Partially Booked";

    supabase
      .from("food_donations")
      .update({ status: newDonationStatus })
      .eq("id", req.food_id)
      .then(() => fetchDonorDonations(currentUser.id));
  };

  const handleDeclineRequest = (req) => {
    if (!window.confirm(`Decline booking request from ${req.receiver_name}?`)) return;

    setFoodRequests((prev) =>
      prev.map((r) =>
        r.id === req.id
          ? {
              ...r,
              status: "Declined",
              donor_response_at: new Date().toISOString(),
            }
          : r
      )
    );
  };

  // ---------------- RECEIVER CONFIRM RECEIVED / DECLINE BOOKING ----------------

  const handleConfirmReceived = (req) => {
    setFoodRequests((prev) =>
      prev.map((r) =>
        r.id === req.id
          ? {
              ...r,
              status: "Received",
              receiver_response_at: new Date().toISOString(),
            }
          : r
      )
    );
    alert("Food received successfully! Thank you for reducing food waste.");
  };

  const handleDeclineBookingByReceiver = (req) => {
    if (!window.confirm("Are you sure you want to decline/cancel this booking? The reserved quantity will immediately become available for other receivers.")) {
      return;
    }

    setFoodRequests((prev) =>
      prev.map((r) =>
        r.id === req.id
          ? {
              ...r,
              status: "Cancelled",
              receiver_response_at: new Date().toISOString(),
            }
          : r
      )
    );

    // Restore donation status in Supabase if needed
    supabase
      .from("food_donations")
      .update({ status: "Available" })
      .eq("id", req.food_id)
      .then(() => fetchAvailableFoods());
  };

  // ---------------- ADMIN VERIFICATION & REJECTION HANDLERS ----------------

  const handleVerifyUser = async (targetUser) => {
    setAdminError("");
    setAdminSuccess("");

    try {
      const verifications = JSON.parse(localStorage.getItem("surplus_verifications") || "{}");
      verifications[targetUser.id] = "Verified";
      localStorage.setItem("surplus_verifications", JSON.stringify(verifications));

      const profiles = JSON.parse(localStorage.getItem("surplus_verification_profiles") || "{}");
      if (profiles[targetUser.id]) {
        profiles[targetUser.id].status = "Verified";
        profiles[targetUser.id].verified_at = new Date().toISOString();
        profiles[targetUser.id].verified_by = currentUser?.id || "admin";
        localStorage.setItem("surplus_verification_profiles", JSON.stringify(profiles));
      }

      setAdminSuccess(`Successfully verified ${targetUser.name}!`);
      setViewingDocUser(null);
      await fetchAdminData(true);
    } catch (err) {
      setAdminError("Failed to update user status.");
    }
  };

  const handleRejectUserWithReason = async (targetUser, reason) => {
    setAdminError("");
    setAdminSuccess("");

    try {
      const verifications = JSON.parse(localStorage.getItem("surplus_verifications") || "{}");
      verifications[targetUser.id] = "Rejected";
      localStorage.setItem("surplus_verifications", JSON.stringify(verifications));

      const profiles = JSON.parse(localStorage.getItem("surplus_verification_profiles") || "{}");
      if (profiles[targetUser.id]) {
        profiles[targetUser.id].status = "Rejected";
        profiles[targetUser.id].rejection_reason = reason || "Incomplete documentation";
        profiles[targetUser.id].verified_at = new Date().toISOString();
        profiles[targetUser.id].verified_by = currentUser?.id || "admin";
        localStorage.setItem("surplus_verification_profiles", JSON.stringify(profiles));
      }

      setAdminSuccess(`Rejected ${targetUser.name} with reason: "${reason || 'Documentation insufficient'}"`);
      setShowRejectPromptForUser(null);
      setViewingDocUser(null);
      await fetchAdminData(true);
    } catch (err) {
      setAdminError("Failed to update user status.");
    }
  };

  // ---------------- CSV EXPORT FUNCTIONS ----------------

  const handleDownloadUsersCSV = () => {
    const profiles = JSON.parse(localStorage.getItem("surplus_verification_profiles") || "{}");
    let csv = "Name,Email,Role,Verification Status,Org Type,Reg/Licence Number,Joined Date\n";
    adminUsers.forEach((u) => {
      const { role: uRole, status: uStatus } = getUserRoleAndStatus(u);
      const prof = profiles[u.id] || {};
      csv += `${escapeCSV(u.name)},${escapeCSV(u.email)},${escapeCSV(uRole.toUpperCase())},${escapeCSV(uStatus)},${escapeCSV(prof.org_type || "N/A")},${escapeCSV(prof.registration_number || "N/A")},${escapeCSV(formatDateTimeDisplay(u.created_at))}\n`;
    });
    triggerCSVDownload("surplus-food-users-report.csv", csv);
  };

  const handleDownloadDonationsCSV = () => {
    let csv = "Food Name,Category,Total Quantity,Reserved,Received,Available,Donor,Location,Status,Created At\n";
    adminDonations.forEach((d) => {
      const alloc = getDonationAllocation(d.id, d.quantity);
      csv += `${escapeCSV(d.food_name)},${escapeCSV(d.category)},${escapeCSV(alloc.total_quantity)},${escapeCSV(alloc.reserved_quantity)},${escapeCSV(alloc.received_quantity)},${escapeCSV(alloc.available_quantity)},${escapeCSV(d.donor?.name || "N/A")},${escapeCSV(d.location)},${escapeCSV(alloc.computedStatus)},${escapeCSV(formatDateTimeDisplay(d.created_at))}\n`;
    });
    triggerCSVDownload("surplus-food-donations-report.csv", csv);
  };

  const handleDownloadRequestsCSV = () => {
    let csv = "Food Name,Requested Quantity,Receiver Org,Donor Org,Message,Requested At,Status,Donor Response At\n";
    foodRequests.forEach((r) => {
      csv += `${escapeCSV(r.food_name)},${escapeCSV(r.requested_quantity)},${escapeCSV(r.receiver_name)},${escapeCSV(r.donor_name)},${escapeCSV(r.message)},${escapeCSV(formatDateTimeDisplay(r.requested_at))},${escapeCSV(r.status)},${escapeCSV(formatDateTimeDisplay(r.donor_response_at))}\n`;
    });
    triggerCSVDownload("surplus-food-requests-report.csv", csv);
  };

  const handleDownloadBookingsCSV = () => {
    let csv = "Food Name,Booked Quantity,Receiver Org,Donor Org,Location,Booking Date,Status\n";
    const acceptedRequests = foodRequests.filter((r) => r.status === "Accepted" || r.status === "Received");
    acceptedRequests.forEach((b) => {
      csv += `${escapeCSV(b.food_name)},${escapeCSV(b.requested_quantity)},${escapeCSV(b.receiver_name)},${escapeCSV(b.donor_name)},${escapeCSV(b.donor_location || "Designated Pickup")},${escapeCSV(formatDateTimeDisplay(b.donor_response_at))},${escapeCSV(b.status === "Received" ? "Received" : "Booked")}\n`;
    });
    triggerCSVDownload("surplus-food-bookings-report.csv", csv);
  };

  const handleDownloadCompletedDonationsCSV = () => {
    let csv = "Food Name,Quantity Received,Receiver Org,Donor Org,Completed Date,Status\n";
    const completed = foodRequests.filter((r) => r.status === "Received");
    completed.forEach((c) => {
      csv += `${escapeCSV(c.food_name)},${escapeCSV(c.requested_quantity)},${escapeCSV(c.receiver_name)},${escapeCSV(c.donor_name)},${escapeCSV(formatDateTimeDisplay(c.receiver_response_at))},${escapeCSV("Completed / Received")}\n`;
    });
    triggerCSVDownload("surplus-food-completed-donations-report.csv", csv);
  };

  // ---------------- FILTERED AVAILABLE FOODS FOR RECEIVER ----------------
  const filteredAvailableFoods = useMemo(() => {
    return availableFoods.filter((f) => {
      const alloc = getDonationAllocation(f.id, f.quantity);
      if (alloc.available_quantity <= 0) return false;

      if (filterCategory !== "All" && f.category !== filterCategory) return false;
      if (filterLocation.trim() && !f.location.toLowerCase().includes(filterLocation.toLowerCase().trim()))
        return false;
      if (filterMaxQty && alloc.available_quantity < parseInt(filterMaxQty, 10)) return false;

      return true;
    });
  }, [availableFoods, getDonationAllocation, filterCategory, filterLocation, filterMaxQty]);

  // ---------------- RENDER VIEWS ----------------

  const renderView = () => {
    // ---------------- LANDING PAGE ----------------
    if (page === "landing") {
      const currentRole = currentUser ? getUserRoleAndStatus(currentUser).role : null;

      return (
        <div className="landing-page">
          <nav className="landing-navbar">
            <div className="landing-brand" onClick={() => setPage("landing")}>
              <div className="logo-icon">🍱</div>
              <h1>Surplus Food Connect</h1>
            </div>

            <div className="landing-nav-actions">
              {currentUser ? (
                <>
                  <span style={{ fontSize: "13px", color: "#4b5e54", fontWeight: "600" }}>
                    👤 {currentUser.name}
                  </span>
                  <button
                    className="hero-btn-primary"
                    style={{ padding: "8px 18px", fontSize: "13px" }}
                    onClick={() => setPage(currentRole || "landing")}
                  >
                    Go to {currentRole?.toUpperCase()} Dashboard →
                  </button>
                  <button className="logout-btn" onClick={logout}>
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="hero-btn-secondary"
                    style={{ padding: "8px 18px", fontSize: "13px" }}
                    onClick={() => {
                      setAuthMode("signin");
                      setPage("login");
                    }}
                  >
                    Sign In
                  </button>
                  <button
                    className="hero-btn-primary"
                    style={{ padding: "8px 18px", fontSize: "13px" }}
                    onClick={() => {
                      setAuthMode("register");
                      setPage("login");
                    }}
                  >
                    Register / Get Started →
                  </button>
                </>
              )}
            </div>
          </nav>

          <header className="landing-hero">
            <div className="landing-hero-badge">
              <span>🌱</span>
              Zero Hunger • Multi-Receiver Request & Allocation Platform
            </div>

            <h2>Connecting Surplus Food With People Who Need It</h2>
            <p>
              A transparent, verified community platform enabling donors to allocate large surplus donations across
              multiple receiver NGOs through direct booking requests.
            </p>

            <div className="landing-hero-actions">
              {currentUser ? (
                <button
                  className="hero-btn-primary"
                  onClick={() => setPage(currentRole || "landing")}
                >
                  Open {currentRole?.toUpperCase()} Dashboard →
                </button>
              ) : (
                <>
                  <button
                    className="hero-btn-primary"
                    onClick={() => {
                      setAuthMode("signin");
                      setPage("login");
                    }}
                  >
                    Sign In to Portal
                  </button>
                  <button
                    className="hero-btn-secondary"
                    onClick={() => {
                      setAuthMode("register");
                      setPage("login");
                    }}
                  >
                    Register New Account →
                  </button>
                </>
              )}
            </div>
          </header>

          <section className="participants-section">
            <div className="section-intro">
              <p className="eyebrow">COMMUNITY WORKFLOW</p>
              <h3>Multi-Receiver Request & Allocation Workflow</h3>
              <p>Verified organizations collaborate seamlessly to distribute meals without food waste.</p>
            </div>

            <div className="participant-cards-grid">
              <div className="participant-card">
                <div className="participant-icon donor">🍲</div>
                <h4>Verified Donors</h4>
                <p>
                  Restaurants and businesses upload FSSAI licences, post bulk meal quantities, review incoming
                  community requests, and accept allocations up to available stock.
                </p>
                <ul className="participant-features">
                  <li>✅ Post 100+ meal quantities</li>
                  <li>✅ Allocate to multiple NGOs</li>
                  <li>✅ Review & accept booking requests</li>
                </ul>
              </div>

              <div className="participant-card">
                <div className="participant-icon receiver">🤝</div>
                <h4>Verified Receivers</h4>
                <p>
                  NGOs and shelters submit official registration, browse available food with area matching, and submit
                  custom portion booking requests with pickup scheduling.
                </p>
                <ul className="participant-features">
                  <li>✅ Request exact needed portions</li>
                  <li>✅ Area & location proximity matching</li>
                  <li>✅ Confirm receipt & decline bookings</li>
                </ul>
              </div>

              <div className="participant-card">
                <div className="participant-icon admin">📊</div>
                <h4>Platform Administrators</h4>
                <p>
                  Audits uploaded licences, verifies participant legitimacy, monitors distribution transactions, and
                  exports complete compliance reports.
                </p>
                <ul className="participant-features">
                  <li>✅ Licence document inspection modal</li>
                  <li>✅ Verify & reject with reasons</li>
                  <li>✅ 5 comprehensive CSV audit reports</li>
                </ul>
              </div>
            </div>
          </section>

          <footer className="landing-footer">
            <p>© {new Date().getFullYear()} Surplus Food Connect • Hackathon Edition</p>
            <p>Powered by React, Vite & Supabase PostgreSQL</p>
          </footer>
        </div>
      );
    }

    // ---------------- LOGIN & REGISTRATION PAGE ----------------
    if (page === "login") {
      return (
        <div className="login-page">
          <div className="login-brand">
            <div style={{ marginBottom: "20px" }}>
              <button
                className="outline-btn"
                style={{ color: "white", borderColor: "rgba(255,255,255,0.3)", background: "transparent" }}
                onClick={() => setPage("landing")}
              >
                ← Back to Home
              </button>
            </div>

            <div className="brand-icon">🍱</div>
            <h1>Surplus Food Connect</h1>
            <p>Connecting surplus food with people who need it</p>

            <div className="login-info">
              <div>
                <span>🛡️</span>
                <p>Official Licence Verification</p>
              </div>
              <div>
                <span>📦</span>
                <p>Multi-Receiver Portion Allocation</p>
              </div>
              <div>
                <span>🤝</span>
                <p>Request → Accept → Booked → Received</p>
              </div>
            </div>
          </div>

          <div className="login-card">
            {/* SWITCH BETWEEN SIGN IN (EMAIL+PASSWORD ONLY) AND REGISTER */}
            {authMode === "signin" ? (
              <>
                <h2>Sign In</h2>
                <p className="login-subtitle">
                  Enter your email and password to access your dashboard.
                </p>

                {signInError && (
                  <div className="login-alert error">
                    <span>⚠️</span>
                    <div>{signInError}</div>
                  </div>
                )}

                {signInSuccess && (
                  <div className="login-alert success">
                    <span>✅</span>
                    <div>{signInSuccess}</div>
                  </div>
                )}

                <form onSubmit={handleSignIn}>
                  <label>Email Address</label>
                  <input
                    type="email"
                    name="email"
                    placeholder="e.g. admin@surplus.com or user@org.com"
                    value={signInForm.email}
                    onChange={(e) => {
                      setSignInError("");
                      setSignInSuccess("");
                      setSignInForm((prev) => ({ ...prev, email: e.target.value }));
                    }}
                    required
                  />

                  <label>Password</label>
                  <input
                    type="password"
                    name="password"
                    placeholder="Enter password"
                    value={signInForm.password}
                    onChange={(e) => {
                      setSignInError("");
                      setSignInSuccess("");
                      setSignInForm((prev) => ({ ...prev, password: e.target.value }));
                    }}
                    required
                  />

                  <button className="primary-btn" type="submit" disabled={signInLoading}>
                    {signInLoading ? "Signing In..." : "Sign In →"}
                  </button>
                </form>

                <div style={{ marginTop: "24px", textAlign: "center", fontSize: "13px", color: "#617068" }}>
                  Don't have an account?{" "}
                  <button
                    type="button"
                    style={{ background: "none", border: "none", color: "#23653f", fontWeight: "700", textDecoration: "underline" }}
                    onClick={() => {
                      setAuthMode("register");
                      setSignInError("");
                      setRegError("");
                    }}
                  >
                    Register as Donor or Receiver
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2>Register Organization</h2>
                <p className="login-subtitle">
                  Create a new Donor or Receiver account with official verification details.
                </p>

                {regError && (
                  <div className="login-alert error">
                    <span>⚠️</span>
                    <div>{regError}</div>
                  </div>
                )}

                {regSuccess && (
                  <div className="login-alert success">
                    <span>✅</span>
                    <div>{regSuccess}</div>
                  </div>
                )}

                <form onSubmit={handleRegister}>
                  <label>Select Role</label>
                  <div className="role-selector-grid">
                    <button
                      type="button"
                      className={`role-tab-btn ${regRole === "donor" ? "active" : ""}`}
                      onClick={() => {
                        setRegRole("donor");
                        setRegForm((prev) => ({ ...prev, org_type: "Restaurant" }));
                      }}
                    >
                      <span style={{ fontSize: "18px" }}>🍲</span>
                      <span>Donor</span>
                    </button>
                    <button
                      type="button"
                      className={`role-tab-btn ${regRole === "receiver" ? "active" : ""}`}
                      onClick={() => {
                        setRegRole("receiver");
                        setRegForm((prev) => ({ ...prev, org_type: "Registered NGO" }));
                      }}
                    >
                      <span style={{ fontSize: "18px" }}>🤝</span>
                      <span>Receiver</span>
                    </button>
                  </div>

                  <label>
                    {regRole === "donor"
                      ? "Donor / Restaurant / Caterer Name *"
                      : "Receiver / NGO / Organization Name *"}
                  </label>
                  <input
                    type="text"
                    name="name"
                    placeholder={regRole === "donor" ? "e.g. Royal Restaurant" : "e.g. Hope Community NGO"}
                    value={regForm.name}
                    onChange={handleRegInputChange}
                    required
                  />

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div>
                      <label>Organization Type *</label>
                      <select name="org_type" value={regForm.org_type} onChange={handleRegInputChange}>
                        {regRole === "donor" ? (
                          <>
                            <option value="Restaurant">Restaurant</option>
                            <option value="Hotel">Hotel</option>
                            <option value="Caterer">Caterer</option>
                            <option value="Grocery Business">Grocery Business</option>
                            <option value="Household / Individual">Household / Individual</option>
                            <option value="Other">Other</option>
                          </>
                        ) : (
                          <>
                            <option value="Registered NGO">Registered NGO</option>
                            <option value="Community Shelter">Community Shelter</option>
                            <option value="Food Bank">Food Bank</option>
                            <option value="Charitable Trust">Charitable Trust</option>
                            <option value="Other">Other</option>
                          </>
                        )}
                      </select>
                    </div>

                    <div>
                      <label>Contact Phone</label>
                      <input
                        type="tel"
                        name="phone"
                        placeholder="e.g. 9876543210"
                        value={regForm.phone}
                        onChange={handleRegInputChange}
                      />
                    </div>
                  </div>

                  <label>Operating Address / Location</label>
                  <input
                    type="text"
                    name="address"
                    placeholder="e.g. Mangalore, Karnataka"
                    value={regForm.address}
                    onChange={handleRegInputChange}
                  />

                  <label>
                    {regRole === "donor" ? "FSSAI / Business Licence Number *" : "NGO / Society Registration Number *"}
                  </label>
                  <input
                    type="text"
                    name="registration_number"
                    placeholder={regRole === "donor" ? "e.g. FSSAI-11223344556677" : "e.g. NGO-DARPAN-KA/2026/012345"}
                    value={regForm.registration_number}
                    onChange={handleRegInputChange}
                    required
                  />

                  <label>Official Registration / Licence Document (PDF or Image)</label>
                  <div className="file-upload-box">
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      id="licenceDocReg"
                      style={{ display: "none" }}
                      onChange={handleFileUpload}
                    />
                    <label htmlFor="licenceDocReg" style={{ cursor: "pointer", margin: 0 }}>
                      <span style={{ fontSize: "24px", display: "block", marginBottom: "4px" }}>📄</span>
                      <strong style={{ fontSize: "13px", color: "#23653f" }}>
                        {regForm.document_name ? regForm.document_name : "Click to Upload Official Document"}
                      </strong>
                      <p style={{ fontSize: "11px", color: "#64748b", margin: "2px 0 0" }}>
                        PDF, PNG, or JPG (Stored securely)
                      </p>
                    </label>
                  </div>

                  <label>Email Address *</label>
                  <input
                    type="email"
                    name="email"
                    placeholder="e.g. user@org.com"
                    value={regForm.email}
                    onChange={handleRegInputChange}
                    required
                  />

                  <label>Password *</label>
                  <input
                    type="password"
                    name="password"
                    placeholder="Enter password"
                    value={regForm.password}
                    onChange={handleRegInputChange}
                    required
                  />

                  <button className="primary-btn" type="submit" disabled={regLoading}>
                    {regLoading ? "Registering..." : `Register as ${regRole.toUpperCase()} →`}
                  </button>
                </form>

                <div style={{ marginTop: "24px", textAlign: "center", fontSize: "13px", color: "#617068" }}>
                  Already have an account?{" "}
                  <button
                    type="button"
                    style={{ background: "none", border: "none", color: "#23653f", fontWeight: "700", textDecoration: "underline" }}
                    onClick={() => {
                      setAuthMode("signin");
                      setSignInError("");
                      setRegError("");
                    }}
                  >
                    Sign In
                  </button>
                </div>
              </>
            )}

            <p className="demo-text">Hackathon Edition • Powered by Supabase PostgreSQL</p>
          </div>
        </div>
      );
    }

    // ---------------- DONOR DASHBOARD ----------------
    if (page === "donor") {
      const donorName = currentUser?.name || "Donor";
      const { status: donorStatus, note: donorNote } = getUserRoleAndStatus(currentUser);
      const isVerified = donorStatus === "Verified";

      // Filter requests for this donor
      const donorRequests = foodRequests.filter((r) => r.donor_id === currentUser.id);
      const activeBookings = donorRequests.filter((r) => r.status === "Accepted");
      const completedDonations = donorRequests.filter((r) => r.status === "Received");

      const totalMealsDonated = donorDonations.reduce(
        (sum, d) => sum + parseQuantityNumber(d.quantity),
        0
      );
      const totalMealsAllocated = activeBookings.reduce(
        (sum, r) => sum + Number(r.requested_quantity || 0),
        0
      );

      return (
        <div className="dashboard">
          <header className="topbar">
            <div className="topbar-brand">
              <div className="small-logo">🍱</div>
              <div>
                <h1>Surplus Food Connect</h1>
                <p>Donor Portal • Welcome, {donorName}</p>
              </div>
            </div>

            <div className="topbar-right">
              <span className="count-badge" style={{ background: "#e8f4ec", color: "#276e43" }}>
                Donor
              </span>
              <span className={`status ${isVerified ? "available" : donorStatus === "Rejected" ? "rejected" : "pending"}`}>
                {donorStatus}
              </span>
              <button className="logout-btn" onClick={logout}>
                Logout
              </button>
            </div>
          </header>

          <main className="dashboard-content">
            <div className="welcome-section">
              <div>
                <p className="eyebrow">DONOR CONTROL CENTER</p>
                <h2>Welcome, {donorName} 👋</h2>
                <p>Post bulk meals, manage receiver requests, and view active/completed distributions.</p>
              </div>
            </div>

            {/* VERIFICATION STATUS NOTICE */}
            {!isVerified && (
              <div
                className="login-alert error"
                style={{
                  background: donorStatus === "Rejected" ? "#fef2f2" : "#fffbeb",
                  color: donorStatus === "Rejected" ? "#991b1b" : "#92400e",
                  borderColor: donorStatus === "Rejected" ? "#fee2e2" : "#fde68a",
                  marginBottom: "25px",
                }}
              >
                <span>⚠️</span>
                <div>
                  <strong>
                    {donorStatus === "Rejected"
                      ? `Account Verification Rejected: ${donorNote || "Documentation could not be verified."}`
                      : "Licence Verification Pending: Your submitted licence is awaiting Admin verification. You can publish food once approved."}
                  </strong>
                </div>
              </div>
            )}

            {/* DONOR SUMMARY METRICS */}
            <div className="stats-grid" style={{ marginBottom: "35px" }}>
              <div className="stat-card">
                <div className="stat-icon">🍱</div>
                <div>
                  <p>TOTAL POSTINGS</p>
                  <h3>{donorDonations.length}</h3>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: "#eaf5ec", color: "#276e43" }}>
                  🟢
                </div>
                <div>
                  <p>MEALS DONATED</p>
                  <h3>{totalMealsDonated}</h3>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: "#eff6ff", color: "#1e40af" }}>
                  🤝
                </div>
                <div>
                  <p>ACTIVE BOOKINGS</p>
                  <h3>{activeBookings.length}</h3>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: "#fdf4ff", color: "#86198f" }}>
                  ✅
                </div>
                <div>
                  <p>COMPLETED DONATIONS</p>
                  <h3>{completedDonations.length}</h3>
                </div>
              </div>
            </div>

            {/* SECTION 1: FOOD REQUESTS */}
            <section className="content-card">
              <div className="section-header">
                <div>
                  <h3>FOOD REQUESTS</h3>
                  <p>Community NGOs requesting portion allocations from your posted donations</p>
                </div>
                <span className="count-badge">
                  {donorRequests.length} {donorRequests.length === 1 ? "Request" : "Requests"}
                </span>
              </div>

              {donorRequests.length === 0 ? (
                <div className="empty-state">
                  <div style={{ fontSize: "36px", marginBottom: "10px" }}>📬</div>
                  <h3>No booking requests yet.</h3>
                  <p>When verified NGOs request food portions from your donations, they will appear here.</p>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Food</th>
                        <th>Receiver Name & Org</th>
                        <th>Requested Qty</th>
                        <th>Location</th>
                        <th>Message</th>
                        <th>Requested Date</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {donorRequests.map((req) => {
                        const food = donorDonations.find((d) => d.id === req.food_id);
                        const alloc = getDonationAllocation(req.food_id, food?.quantity);

                        return (
                          <tr key={req.id}>
                            <td>
                              <strong>{req.food_name}</strong>
                              <div style={{ fontSize: "11px", color: "#617068" }}>
                                {alloc.available_quantity} meals available
                              </div>
                            </td>
                            <td>
                              <strong>{req.receiver_name}</strong>
                              <div style={{ fontSize: "11px", color: "#617068" }}>{req.receiver_email}</div>
                            </td>
                            <td>
                              <strong style={{ fontSize: "15px", color: "#23653f" }}>
                                {req.requested_quantity} meals
                              </strong>
                            </td>
                            <td>📍 {req.donor_location || "Mangalore"}</td>
                            <td>
                              <span style={{ fontSize: "12px", color: "#374151" }}>"{req.message}"</span>
                            </td>
                            <td>🕒 {formatDateTimeDisplay(req.requested_at)}</td>
                            <td>
                              <span
                                className={`status ${
                                  req.status === "Accepted"
                                    ? "accepted"
                                    : req.status === "Received"
                                    ? "completed"
                                    : req.status === "Declined" || req.status === "Cancelled"
                                    ? "rejected"
                                    : "request-sent"
                                }`}
                              >
                                {req.status === "Accepted"
                                  ? "BOOKED ✅"
                                  : req.status === "Received"
                                  ? "RECEIVED 📦"
                                  : req.status === "Pending"
                                  ? "PENDING ⏳"
                                  : req.status === "Declined"
                                  ? "DECLINED"
                                  : "CANCELLED"}
                              </span>
                            </td>
                            <td>
                              {req.status === "Pending" ? (
                                <div style={{ display: "flex", gap: "6px" }}>
                                  <button
                                    className="verify-action-btn"
                                    onClick={() => handleAcceptRequest(req)}
                                    title="Accept and reserve quantity"
                                  >
                                    ACCEPT
                                  </button>
                                  <button
                                    className="reject-action-btn"
                                    onClick={() => handleDeclineRequest(req)}
                                    title="Decline request"
                                  >
                                    DECLINE
                                  </button>
                                </div>
                              ) : (
                                <span style={{ fontSize: "12px", color: "#64748b" }}>{req.status}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* SECTION 2: ACTIVE BOOKINGS */}
            <section className="content-card">
              <div className="section-header">
                <div>
                  <h3>ACTIVE BOOKINGS</h3>
                  <p>Accepted food allocations awaiting receiver pickup/distribution</p>
                </div>
                <span className="count-badge">{activeBookings.length} Active</span>
              </div>

              {activeBookings.length === 0 ? (
                <div className="empty-state">
                  <div style={{ fontSize: "36px", marginBottom: "10px" }}>🤝</div>
                  <h3>No active bookings at the moment.</h3>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Food</th>
                        <th>Receiver</th>
                        <th>Quantity</th>
                        <th>Location</th>
                        <th>Booking Date</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeBookings.map((b) => (
                        <tr key={b.id}>
                          <td>
                            <strong>{b.food_name}</strong>
                          </td>
                          <td>
                            <strong>{b.receiver_name}</strong>
                            <div style={{ fontSize: "11px", color: "#617068" }}>{b.receiver_email}</div>
                          </td>
                          <td>
                            <strong style={{ color: "#166534" }}>{b.requested_quantity} meals</strong>
                          </td>
                          <td>📍 {b.donor_location || "Designated Location"}</td>
                          <td>🕒 {formatDateTimeDisplay(b.donor_response_at)}</td>
                          <td>
                            <span className="status booked">BOOKED ✅</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* SECTION 3: COMPLETED DONATIONS */}
            <section className="content-card">
              <div className="section-header">
                <div>
                  <h3>COMPLETED DONATIONS</h3>
                  <p>Donations successfully received by community organizations</p>
                </div>
                <span className="count-badge">{completedDonations.length} Completed</span>
              </div>

              {completedDonations.length === 0 ? (
                <div className="empty-state">
                  <div style={{ fontSize: "36px", marginBottom: "10px" }}>📦</div>
                  <h3>No completed donations yet.</h3>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Food</th>
                        <th>Receiver</th>
                        <th>Quantity</th>
                        <th>Location</th>
                        <th>Received Date</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {completedDonations.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <strong>{c.food_name}</strong>
                          </td>
                          <td>
                            <strong>{c.receiver_name}</strong>
                          </td>
                          <td>
                            <strong style={{ color: "#166534" }}>{c.requested_quantity} meals</strong>
                          </td>
                          <td>📍 {c.donor_location || "Mangalore"}</td>
                          <td>🕒 {formatDateTimeDisplay(c.receiver_response_at)}</td>
                          <td>
                            <span className="status completed">RECEIVED ✅</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* SECTION 4: POST SURPLUS FOOD FORM */}
            <section className="form-card">
              <div className="form-heading">
                <div className="form-icon">🍲</div>
                <div>
                  <h2>Post Bulk Surplus Food</h2>
                  <p>Specify the total quantity available to be distributed among multiple community receivers.</p>
                </div>
              </div>

              {donationError && (
                <div className="login-alert error">
                  <span>⚠️</span>
                  <div>{donationError}</div>
                </div>
              )}

              {donationSuccess && (
                <div className="login-alert success">
                  <span>✅</span>
                  <div>{donationSuccess}</div>
                </div>
              )}

              <form onSubmit={handleDonateSubmit}>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Food Name *</label>
                    <input
                      type="text"
                      name="food_name"
                      placeholder="e.g. Vegetable Biryani"
                      value={donationForm.food_name}
                      onChange={handleDonationInputChange}
                      disabled={!isVerified}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Category *</label>
                    <select
                      name="category"
                      value={donationForm.category}
                      onChange={handleDonationInputChange}
                      disabled={!isVerified}
                    >
                      <option value="Cooked Meal">Cooked Meal</option>
                      <option value="Fruits">Fruits</option>
                      <option value="Vegetables">Vegetables</option>
                      <option value="Bakery">Bakery</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Total Available Quantity (e.g. 100 meals) *</label>
                    <input
                      type="text"
                      name="quantity"
                      placeholder="e.g. 100 meals"
                      value={donationForm.quantity}
                      onChange={handleDonationInputChange}
                      disabled={!isVerified}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Prepared At (Time)</label>
                    <input
                      type="time"
                      name="prepared_at"
                      value={donationForm.prepared_at}
                      onChange={handleDonationInputChange}
                      disabled={!isVerified}
                    />
                  </div>

                  <div className="form-group">
                    <label>Best Before (Consume By) *</label>
                    <input
                      type="time"
                      name="best_before"
                      value={donationForm.best_before}
                      onChange={handleDonationInputChange}
                      disabled={!isVerified}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Contact Phone</label>
                    <input
                      type="tel"
                      name="contact"
                      placeholder="e.g. 9876543210"
                      value={donationForm.contact}
                      onChange={handleDonationInputChange}
                      disabled={!isVerified}
                    />
                  </div>

                  <div className="form-group full-width">
                    <label>Pickup Location *</label>
                    <input
                      type="text"
                      name="location"
                      placeholder="e.g. Mangalore / Restaurant Address"
                      value={donationForm.location}
                      onChange={handleDonationInputChange}
                      disabled={!isVerified}
                      required
                    />
                  </div>

                  <div className="form-group full-width">
                    <label>Description & Packaging Notes</label>
                    <textarea
                      name="description"
                      placeholder="e.g. Freshly cooked vegetarian meals packed hygienically in foil containers."
                      value={donationForm.description}
                      onChange={handleDonationInputChange}
                      disabled={!isVerified}
                      rows="3"
                    />
                  </div>
                </div>

                <div className="form-actions">
                  <button className="primary-btn" type="submit" disabled={donationPosting || !isVerified}>
                    {!isVerified
                      ? "Awaiting Admin Verification"
                      : donationPosting
                      ? "Posting..."
                      : "Post Food Donation →"}
                  </button>
                </div>
              </form>
            </section>

            {/* SECTION 5: MY POSTED DONATIONS */}
            <section className="content-card">
              <div className="section-header">
                <div>
                  <h3>My Posted Food Batches</h3>
                  <p>Live tracking of total, reserved, and available quantities</p>
                </div>
                <span className="count-badge">{donorDonations.length} Active Batches</span>
              </div>

              {donorDonations.length === 0 ? (
                <div className="empty-state">
                  <div style={{ fontSize: "36px", marginBottom: "10px" }}>🍱</div>
                  <h3>No food donations yet.</h3>
                  <p>Post your first surplus batch above.</p>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Food Name</th>
                        <th>Total Quantity</th>
                        <th>Reserved</th>
                        <th>Remaining Available</th>
                        <th>Location</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {donorDonations.map((item) => {
                        const alloc = getDonationAllocation(item.id, item.quantity);

                        return (
                          <tr key={item.id}>
                            <td>
                              <strong>{item.food_name}</strong>
                              <div style={{ fontSize: "11px", color: "#617068" }}>{item.category}</div>
                            </td>
                            <td>
                              <strong>{alloc.total_quantity} meals</strong>
                            </td>
                            <td>
                              <span style={{ color: "#1e40af", fontWeight: "600" }}>
                                {alloc.reserved_quantity} meals
                              </span>
                            </td>
                            <td>
                              <strong style={{ color: alloc.available_quantity > 0 ? "#166534" : "#991b1b" }}>
                                {alloc.available_quantity} meals
                              </strong>
                              <div className="allocation-bar-bg">
                                <div
                                  className="allocation-bar-fill"
                                  style={{
                                    width: `${alloc.total_quantity > 0 ? ((alloc.reserved_quantity + alloc.received_quantity) / alloc.total_quantity) * 100 : 0}%`,
                                    background: alloc.available_quantity === 0 ? "#991b1b" : "#23653f",
                                  }}
                                />
                              </div>
                            </td>
                            <td>📍 {item.location}</td>
                            <td>
                              <span
                                className={`status ${
                                  alloc.computedStatus === "Fully Booked"
                                    ? "fully-booked"
                                    : alloc.computedStatus === "Partially Booked"
                                    ? "partially-booked"
                                    : alloc.computedStatus === "Completed"
                                    ? "completed"
                                    : "available"
                                }`}
                              >
                                {alloc.computedStatus}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </main>
        </div>
      );
    }

    // ---------------- RECEIVER DASHBOARD ----------------
    if (page === "receiver") {
      const receiverName = currentUser?.name || "Receiver";
      const { status: receiverStatus, note: receiverNote } = getUserRoleAndStatus(currentUser);
      const isVerified = receiverStatus === "Verified";

      // Filter requests for this receiver
      const receiverRequests = foodRequests.filter((r) => r.receiver_id === currentUser.id);
      const myBookings = receiverRequests.filter((r) => r.status === "Accepted");

      return (
        <div className="dashboard">
          <header className="topbar">
            <div className="topbar-brand">
              <div className="small-logo">🍱</div>
              <div>
                <h1>Surplus Food Connect</h1>
                <p>Receiver Portal • Welcome, {receiverName}</p>
              </div>
            </div>

            <div className="topbar-right">
              <span className="count-badge" style={{ background: "#eff6ff", color: "#1e40af" }}>
                Receiver
              </span>
              <span className={`status ${isVerified ? "available" : receiverStatus === "Rejected" ? "rejected" : "pending"}`}>
                {receiverStatus}
              </span>
              <button className="logout-btn" onClick={logout}>
                Logout
              </button>
            </div>
          </header>

          <main className="dashboard-content">
            <div className="welcome-section">
              <div>
                <p className="eyebrow">COMMUNITY RECEIVER PORTAL</p>
                <h2>Welcome, {receiverName} 🤝</h2>
                <p>Browse available food batches, send portion requests, and confirm received distributions.</p>
              </div>
            </div>

            {/* VERIFICATION NOTICE */}
            {!isVerified && (
              <div
                className="login-alert error"
                style={{
                  background: receiverStatus === "Rejected" ? "#fef2f2" : "#fffbeb",
                  color: receiverStatus === "Rejected" ? "#991b1b" : "#92400e",
                  borderColor: receiverStatus === "Rejected" ? "#fee2e2" : "#fde68a",
                  marginBottom: "25px",
                }}
              >
                <span>⚠️</span>
                <div>
                  <strong>
                    {receiverStatus === "Rejected"
                      ? `Account Verification Rejected: ${receiverNote || "Documentation could not be verified."}`
                      : "Registration Verification Pending: Your account is awaiting admin verification. You can browse food now and will be able to send requests once verified."}
                  </strong>
                </div>
              </div>
            )}

            {/* SECTION 1: AVAILABLE FOOD FEED */}
            <section style={{ marginBottom: "40px" }}>
              <div className="section-header" style={{ background: "transparent", padding: "0 0 16px" }}>
                <div>
                  <h3 style={{ fontSize: "20px" }}>Available Surplus Food Feed</h3>
                  <p>Browse fresh surplus food and request portions for your community</p>
                </div>
              </div>

              {/* Filter Bar */}
              <div className="filter-bar">
                <div className="filter-group">
                  <span>📍 Location:</span>
                  <input
                    type="text"
                    placeholder="e.g. Mangalore, Surathkal..."
                    value={filterLocation}
                    onChange={(e) => setFilterLocation(e.target.value)}
                  />
                </div>

                <div className="filter-group">
                  <span>🍲 Category:</span>
                  <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                    <option value="All">All Categories</option>
                    <option value="Cooked Meal">Cooked Meal</option>
                    <option value="Fruits">Fruits</option>
                    <option value="Vegetables">Vegetables</option>
                    <option value="Bakery">Bakery</option>
                  </select>
                </div>

                <div className="filter-group">
                  <span>🔢 Min Meals:</span>
                  <input
                    type="number"
                    placeholder="e.g. 10"
                    value={filterMaxQty}
                    onChange={(e) => setFilterMaxQty(e.target.value)}
                  />
                </div>
              </div>

              {loadingAvailable ? (
                <div style={{ padding: "40px", textAlign: "center", color: "#617068" }}>
                  <p>Loading available food...</p>
                </div>
              ) : filteredAvailableFoods.length === 0 ? (
                <div className="empty-state content-card">
                  <div style={{ fontSize: "36px", marginBottom: "10px" }}>🍱</div>
                  <h3>No surplus food matches your criteria.</h3>
                  <p>Check back soon or adjust your filter parameters.</p>
                </div>
              ) : (
                <div className="food-grid">
                  {filteredAvailableFoods.map((food) => {
                    const alloc = getDonationAllocation(food.id, food.quantity);
                    const userLoc = currentUser?.address || "Mangalore";
                    const locRel = getLocationRelationship(food.location, userLoc);

                    return (
                      <div className="food-card" key={food.id}>
                        <div className="food-card-top">
                          <div className="food-image">🍛</div>
                          <span
                            className={`location-badge ${
                              locRel === "Same Area" ? "same-area" : locRel === "Nearby" ? "nearby" : "other"
                            }`}
                          >
                            📍 {locRel}
                          </span>
                        </div>

                        <h3>{food.food_name}</h3>
                        <p className="food-description">
                          {food.description || "Fresh surplus food ready for immediate portion booking."}
                        </p>

                        <div className="food-details">
                          <div>
                            <span>🍽️</span>
                            <p>
                              Available: <strong style={{ color: "#166534" }}>{alloc.available_quantity} meals</strong> (of{" "}
                              {alloc.total_quantity})
                            </p>
                          </div>

                          <div>
                            <span>📍</span>
                            <p>Pickup: {food.location}</p>
                          </div>

                          <div>
                            <span>⏰</span>
                            <p>Best Before: {formatTimeDisplay(food.best_before)}</p>
                          </div>
                        </div>

                        <div className="donor-info">
                          <span>Donated by</span>
                          <strong>{food.donor?.name || "Verified Donor"}</strong>
                        </div>

                        <button
                          className="claim-btn"
                          onClick={() => openRequestModal(food)}
                          disabled={!isVerified}
                        >
                          {!isVerified ? "Awaiting Verification" : "REQUEST FOOD →"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* SECTION 2: MY REQUESTS */}
            <section className="content-card">
              <div className="section-header">
                <div>
                  <h3>MY REQUESTS</h3>
                  <p>Live status of your portion requests submitted to donors</p>
                </div>
                <span className="count-badge">
                  {receiverRequests.length} {receiverRequests.length === 1 ? "Request" : "Requests"}
                </span>
              </div>

              {receiverRequests.length === 0 ? (
                <div className="empty-state">
                  <div style={{ fontSize: "36px", marginBottom: "10px" }}>📨</div>
                  <h3>No booking requests sent yet.</h3>
                  <p>Click "REQUEST FOOD" on any available food batch to send your request.</p>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Food</th>
                        <th>Donor</th>
                        <th>Quantity</th>
                        <th>Location</th>
                        <th>Requested Date</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receiverRequests.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <strong>{r.food_name}</strong>
                          </td>
                          <td>👤 {r.donor_name}</td>
                          <td>
                            <strong style={{ color: "#23653f" }}>{r.requested_quantity} meals</strong>
                          </td>
                          <td>📍 {r.donor_location || "Mangalore"}</td>
                          <td>🕒 {formatDateTimeDisplay(r.requested_at)}</td>
                          <td>
                            <span
                              className={`status ${
                                r.status === "Accepted"
                                  ? "accepted"
                                  : r.status === "Received"
                                  ? "completed"
                                  : r.status === "Declined" || r.status === "Cancelled"
                                  ? "rejected"
                                  : "request-sent"
                              }`}
                            >
                              {r.status === "Accepted"
                                ? "BOOKED ✅"
                                : r.status === "Received"
                                ? "RECEIVED 📦"
                                : r.status === "Pending"
                                ? "PENDING ⏳"
                                : r.status === "Declined"
                                ? "DECLINED"
                                : "CANCELLED"}
                            </span>
                            <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                              {r.status === "Pending"
                                ? "Waiting for donor approval."
                                : r.status === "Accepted"
                                ? "Donor accepted your request."
                                : r.status === "Received"
                                ? "Food received successfully."
                                : ""}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* SECTION 3: MY BOOKINGS */}
            <section className="content-card">
              <div className="section-header">
                <div>
                  <h3>MY BOOKINGS</h3>
                  <p>Accepted food allocations confirmed by donors for community pickup</p>
                </div>
                <span className="count-badge">
                  {myBookings.length} {myBookings.length === 1 ? "Booking" : "Bookings"}
                </span>
              </div>

              {myBookings.length === 0 ? (
                <div className="empty-state">
                  <div style={{ fontSize: "36px", marginBottom: "10px" }}>🤝</div>
                  <h3>You have no active bookings.</h3>
                  <p>Once donors accept your requests, confirmed bookings will appear here.</p>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Food</th>
                        <th>Donor</th>
                        <th>Quantity</th>
                        <th>Pickup Location</th>
                        <th>Booking Date</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myBookings.map((b) => (
                        <tr key={b.id}>
                          <td>
                            <strong>{b.food_name}</strong>
                          </td>
                          <td>👤 {b.donor_name}</td>
                          <td>
                            <strong style={{ color: "#166534" }}>{b.requested_quantity} meals</strong>
                          </td>
                          <td>📍 {b.donor_location || "Designated Location"}</td>
                          <td>🕒 {formatDateTimeDisplay(b.donor_response_at)}</td>
                          <td>
                            <span className="status booked">BOOKED ✅</span>
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: "6px" }}>
                              <button
                                className="verify-action-btn"
                                onClick={() => handleConfirmReceived(b)}
                                title="Confirm you have received the food"
                              >
                                FOOD RECEIVED
                              </button>
                              <button
                                className="reject-action-btn"
                                onClick={() => handleDeclineBookingByReceiver(b)}
                                title="Decline booking and release quantity"
                              >
                                DECLINE BOOKING
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* BOOKING REQUEST MODAL */}
            {requestModalFood && (
              <div className="modal-overlay" onClick={() => setRequestModalFood(null)}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                    <h3>Request Food: {requestModalFood.food_name}</h3>
                    <button className="close-modal-btn" onClick={() => setRequestModalFood(null)}>
                      ✕
                    </button>
                  </div>

                  <form onSubmit={handleRequestSubmit}>
                    <div className="modal-body">
                      {requestError && (
                        <div className="login-alert error" style={{ marginBottom: "16px" }}>
                          <span>⚠️</span>
                          <div>{requestError}</div>
                        </div>
                      )}

                      {requestSuccess && (
                        <div className="login-alert success" style={{ marginBottom: "16px" }}>
                          <span>✅</span>
                          <div>{requestSuccess}</div>
                        </div>
                      )}

                      <div
                        style={{
                          background: "#f0fdf4",
                          border: "1px solid #bbf7d0",
                          borderRadius: "10px",
                          padding: "12px 16px",
                          marginBottom: "18px",
                          fontSize: "13px",
                        }}
                      >
                        <p><strong>Food name:</strong> {requestModalFood.food_name}</p>
                        <p>
                          <strong>Available quantity:</strong>{" "}
                          {getDonationAllocation(requestModalFood.id, requestModalFood.quantity).available_quantity} meals
                        </p>
                      </div>

                      <div className="form-group" style={{ marginBottom: "14px" }}>
                        <label>Requested Quantity *</label>
                        <input
                          type="number"
                          placeholder="e.g. 25"
                          value={requestForm.requested_quantity}
                          onChange={(e) =>
                            setRequestForm((prev) => ({
                              ...prev,
                              requested_quantity: e.target.value,
                            }))
                          }
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label>Message *</label>
                        <textarea
                          rows="3"
                          placeholder="e.g. We require food for 25 people at the community shelter"
                          value={requestForm.message}
                          onChange={(e) =>
                            setRequestForm((prev) => ({
                              ...prev,
                              message: e.target.value,
                            }))
                          }
                          required
                        />
                      </div>
                    </div>

                    <div className="modal-footer">
                      <button
                        type="button"
                        className="outline-btn"
                        onClick={() => setRequestModalFood(null)}
                      >
                        Cancel
                      </button>
                      <button type="submit" className="primary-btn" disabled={requestSubmitting} style={{ width: "auto" }}>
                        {requestSubmitting ? "Sending..." : "SEND REQUEST"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </main>
        </div>
      );
    }

    // ---------------- ADMIN DASHBOARD ----------------
    if (page === "admin") {
      const adminName = currentUser?.name || "Admin";

      const totalMealsDonated = adminDonations.reduce(
        (sum, d) => sum + parseQuantityNumber(d.quantity),
        0
      );
      
      const activeBookings = foodRequests.filter((r) => r.status === "Accepted");
      const completedDonations = foodRequests.filter((r) => r.status === "Received");
      const pendingRequests = foodRequests.filter((r) => r.status === "Pending");

      const totalMealsReserved = activeBookings.reduce((sum, r) => sum + Number(r.requested_quantity || 0), 0);
      const totalMealsReceived = completedDonations.reduce((sum, r) => sum + Number(r.requested_quantity || 0), 0);
      const totalAvailableFood = Math.max(0, totalMealsDonated - (totalMealsReserved + totalMealsReceived));

      const verifiedUsers = adminUsers.filter((u) => getUserRoleAndStatus(u).status === "Verified" && getUserRoleAndStatus(u).role !== "admin");
      const pendingUsers = adminUsers.filter((u) => getUserRoleAndStatus(u).status === "Pending" && getUserRoleAndStatus(u).role !== "admin");
      const rejectedUsers = adminUsers.filter((u) => getUserRoleAndStatus(u).status === "Rejected" && getUserRoleAndStatus(u).role !== "admin");

      const verificationProfiles = JSON.parse(
        localStorage.getItem("surplus_verification_profiles") || "{}"
      );

      return (
        <div className="dashboard">
          <header className="topbar">
            <div className="topbar-brand">
              <div className="small-logo">🍱</div>
              <div>
                <h1>Surplus Food Connect</h1>
                <p>Admin Control Portal • Welcome, {adminName}</p>
              </div>
            </div>

            <div className="topbar-right">
              <span className="count-badge" style={{ background: "#ffedd5", color: "#7c2d12" }}>
                Admin
              </span>
              <button className="logout-btn" onClick={logout}>
                Logout
              </button>
            </div>
          </header>

          <main className="dashboard-content">
            <div className="welcome-section">
              <div>
                <p className="eyebrow">ADMIN CONTROL CENTER</p>
                <h2>System Monitoring & Verification Portal 📊</h2>
                <p>Verify user licences, monitor all requests and bookings, and export compliance reports.</p>
              </div>

              <button
                className="outline-btn"
                onClick={() => fetchAdminData(true)}
                disabled={adminRefreshing || loadingAdmin}
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <span>🔄</span>
                <span>{adminRefreshing ? "Refreshing..." : "Refresh Data"}</span>
              </button>
            </div>

            {/* ADMIN TABS NAVIGATION */}
            <div className="admin-nav-tabs">
              <button
                className={`admin-tab-btn ${adminTab === "overview" ? "active" : ""}`}
                onClick={() => setAdminTab("overview")}
              >
                <span>📊</span>
                <span>Overview</span>
              </button>
              <button
                className={`admin-tab-btn ${adminTab === "verification" ? "active" : ""}`}
                onClick={() => setAdminTab("verification")}
              >
                <span>🛡️</span>
                <span>User Verification</span>
                {pendingUsers.length > 0 && <span className="tab-badge">{pendingUsers.length}</span>}
              </button>
              <button
                className={`admin-tab-btn ${adminTab === "donations" ? "active" : ""}`}
                onClick={() => setAdminTab("donations")}
              >
                <span>🍲</span>
                <span>Food Donations ({adminDonations.length})</span>
              </button>
              <button
                className={`admin-tab-btn ${adminTab === "requests" ? "active" : ""}`}
                onClick={() => setAdminTab("requests")}
              >
                <span>📋</span>
                <span>All Food Requests ({foodRequests.length})</span>
              </button>
              <button
                className={`admin-tab-btn ${adminTab === "bookings" ? "active" : ""}`}
                onClick={() => setAdminTab("bookings")}
              >
                <span>🤝</span>
                <span>All Bookings ({activeBookings.length})</span>
              </button>
              <button
                className={`admin-tab-btn ${adminTab === "users" ? "active" : ""}`}
                onClick={() => setAdminTab("users")}
              >
                <span>👥</span>
                <span>Registered Users ({adminUsers.length})</span>
              </button>
              <button
                className={`admin-tab-btn ${adminTab === "reports" ? "active" : ""}`}
                onClick={() => setAdminTab("reports")}
              >
                <span>📈</span>
                <span>Reports & Analytics</span>
              </button>
            </div>

            {adminError && (
              <div className="login-alert error" style={{ marginBottom: "25px" }}>
                <span>⚠️</span>
                <div>{adminError}</div>
              </div>
            )}

            {adminSuccess && (
              <div className="login-alert success" style={{ marginBottom: "25px" }}>
                <span>✅</span>
                <div>{adminSuccess}</div>
              </div>
            )}

            {/* TAB 1: OVERVIEW STATISTICS */}
            {adminTab === "overview" && (
              <>
                <div className="stats-grid" style={{ marginBottom: "25px" }}>
                  <div className="stat-card">
                    <div className="stat-icon">👥</div>
                    <div>
                      <p>TOTAL USERS</p>
                      <h3>{adminUsers.length}</h3>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon" style={{ background: "#eaf5ec", color: "#276e43" }}>
                      ✅
                    </div>
                    <div>
                      <p>VERIFIED USERS</p>
                      <h3>{verifiedUsers.length}</h3>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon" style={{ background: "#fffbeb", color: "#b45309" }}>
                      ⏳
                    </div>
                    <div>
                      <p>PENDING USERS</p>
                      <h3>{pendingUsers.length}</h3>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon" style={{ background: "#fef2f2", color: "#991b1b" }}>
                      ❌
                    </div>
                    <div>
                      <p>REJECTED USERS</p>
                      <h3>{rejectedUsers.length}</h3>
                    </div>
                  </div>
                </div>

                <div className="stats-grid" style={{ marginBottom: "35px" }}>
                  <div className="stat-card">
                    <div className="stat-icon">🍱</div>
                    <div>
                      <p>TOTAL DONATIONS</p>
                      <h3>{adminDonations.length}</h3>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon" style={{ background: "#eaf5ec", color: "#276e43" }}>
                      🍽️
                    </div>
                    <div>
                      <p>AVAILABLE FOOD (MEALS)</p>
                      <h3>{totalAvailableFood}</h3>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon" style={{ background: "#eff6ff", color: "#1e40af" }}>
                      📋
                    </div>
                    <div>
                      <p>PENDING REQUESTS</p>
                      <h3>{pendingRequests.length}</h3>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon" style={{ background: "#fdf4ff", color: "#86198f" }}>
                      📦
                    </div>
                    <div>
                      <p>COMPLETED DONATIONS</p>
                      <h3>{completedDonations.length}</h3>
                    </div>
                  </div>
                </div>

                {pendingUsers.length > 0 && (
                  <div
                    style={{
                      background: "#fffbeb",
                      border: "1px solid #fde68a",
                      borderRadius: "14px",
                      padding: "18px 24px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "30px",
                    }}
                  >
                    <div>
                      <h4 style={{ color: "#92400e", marginBottom: "4px" }}>
                        🛡️ PENDING VERIFICATIONS: {pendingUsers.length} Account{pendingUsers.length === 1 ? "" : "s"}
                      </h4>
                      <p style={{ fontSize: "13px", color: "#b45309" }}>
                        Review submitted licences and verify donors/receivers to enable platform participation.
                      </p>
                    </div>
                    <button
                      className="hero-btn-primary"
                      style={{ padding: "8px 16px", fontSize: "13px" }}
                      onClick={() => setAdminTab("verification")}
                    >
                      Review Requests →
                    </button>
                  </div>
                )}
              </>
            )}

            {/* TAB 2: USER VERIFICATION */}
            {adminTab === "verification" && (
              <section className="content-card">
                <div className="section-header">
                  <div>
                    <h3>USER VERIFICATION</h3>
                    <p>Inspect uploaded documentation, FSSAI / NGO licences, and verify participants</p>
                  </div>
                  <span className="count-badge">
                    {adminUsers.filter((u) => getUserRoleAndStatus(u).role !== "admin").length} Accounts
                  </span>
                </div>

                {adminUsers.filter((u) => getUserRoleAndStatus(u).role !== "admin").length === 0 ? (
                  <div className="empty-state">
                    <div style={{ fontSize: "36px", marginBottom: "10px" }}>👥</div>
                    <h3>No accounts registered yet.</h3>
                  </div>
                ) : (
                  <div className="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Role</th>
                          <th>Verification Status</th>
                          <th>Document</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminUsers
                          .filter((u) => getUserRoleAndStatus(u).role !== "admin")
                          .map((u) => {
                            const { role: uRole, status: uStatus, note: uNote } = getUserRoleAndStatus(u);
                            const prof = verificationProfiles[u.id] || {};

                            return (
                              <tr key={u.id}>
                                <td>
                                  <strong>{u.name}</strong>
                                  <div style={{ fontSize: "11px", color: "#617068" }}>
                                    {prof.org_type || "Organization"}
                                  </div>
                                </td>
                                <td>{u.email}</td>
                                <td>
                                  <span className={`role-badge ${uRole}`}>{uRole}</span>
                                </td>
                                <td>
                                  <span
                                    className={
                                      uStatus === "Verified"
                                        ? "badge-verified"
                                        : uStatus === "Rejected"
                                        ? "badge-rejected"
                                        : "badge-pending"
                                    }
                                  >
                                    {uStatus}
                                  </span>
                                  {uNote && (
                                    <div style={{ fontSize: "11px", color: "#991b1b", marginTop: "2px" }}>
                                      Note: {uNote}
                                    </div>
                                  )}
                                </td>
                                <td>
                                  <button
                                    className="view-doc-btn"
                                    onClick={() => setViewingDocUser({ ...u, ...prof })}
                                  >
                                    VIEW DOCUMENT
                                  </button>
                                </td>
                                <td>
                                  <div style={{ display: "flex", gap: "6px" }}>
                                    {uStatus !== "Verified" && (
                                      <button className="verify-action-btn" onClick={() => handleVerifyUser(u)}>
                                        VERIFY
                                      </button>
                                    )}
                                    {uStatus !== "Rejected" && (
                                      <button
                                        className="reject-action-btn"
                                        onClick={() => setShowRejectPromptForUser(u)}
                                      >
                                        REJECT
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {/* TAB 3: ALL FOOD DONATIONS */}
            {adminTab === "donations" && (
              <section className="content-card">
                <div className="section-header">
                  <div>
                    <h3>ALL FOOD DONATIONS</h3>
                    <p>Master registry of bulk donations with calculated availability</p>
                  </div>
                  <span className="count-badge">{adminDonations.length} Records</span>
                </div>

                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Food</th>
                        <th>Category</th>
                        <th>Total Meals</th>
                        <th>Reserved</th>
                        <th>Available</th>
                        <th>Donor</th>
                        <th>Location</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminDonations.map((d) => {
                        const alloc = getDonationAllocation(d.id, d.quantity);

                        return (
                          <tr key={d.id}>
                            <td>
                              <strong>{d.food_name}</strong>
                            </td>
                            <td>{d.category}</td>
                            <td>{alloc.total_quantity} meals</td>
                            <td>{alloc.reserved_quantity} meals</td>
                            <td>
                              <strong style={{ color: alloc.available_quantity > 0 ? "#166534" : "#991b1b" }}>
                                {alloc.available_quantity} meals
                              </strong>
                            </td>
                            <td>👤 {d.donor?.name || "N/A"}</td>
                            <td>📍 {d.location}</td>
                            <td>
                              <span
                                className={`status ${
                                  alloc.computedStatus === "Fully Booked"
                                    ? "fully-booked"
                                    : alloc.computedStatus === "Partially Booked"
                                    ? "partially-booked"
                                    : alloc.computedStatus === "Completed"
                                    ? "completed"
                                    : "available"
                                }`}
                              >
                                {alloc.computedStatus}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* TAB 4: ALL FOOD REQUESTS */}
            {adminTab === "requests" && (
              <section className="content-card">
                <div className="section-header">
                  <div>
                    <h3>ALL FOOD REQUESTS</h3>
                    <p>Audit trail of all portion requests sent across the platform</p>
                  </div>
                  <span className="count-badge">{foodRequests.length} Requests</span>
                </div>

                {foodRequests.length === 0 ? (
                  <div className="empty-state">
                    <div style={{ fontSize: "36px", marginBottom: "10px" }}>📋</div>
                    <h3>No food requests recorded yet.</h3>
                  </div>
                ) : (
                  <div className="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>Food</th>
                          <th>Donor</th>
                          <th>Receiver</th>
                          <th>Quantity</th>
                          <th>Requested At</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {foodRequests.map((r) => (
                          <tr key={r.id}>
                            <td>
                              <strong>{r.food_name}</strong>
                            </td>
                            <td>👤 {r.donor_name}</td>
                            <td>🤝 {r.receiver_name}</td>
                            <td>
                              <strong style={{ color: "#23653f" }}>{r.requested_quantity} meals</strong>
                            </td>
                            <td>🕒 {formatDateTimeDisplay(r.requested_at)}</td>
                            <td>
                              <span
                                className={`status ${
                                  r.status === "Accepted"
                                    ? "accepted"
                                    : r.status === "Received"
                                    ? "completed"
                                    : r.status === "Declined" || r.status === "Cancelled"
                                    ? "rejected"
                                    : "request-sent"
                                }`}
                              >
                                {r.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {/* TAB 5: ALL BOOKINGS */}
            {adminTab === "bookings" && (
              <section className="content-card">
                <div className="section-header">
                  <div>
                    <h3>ALL BOOKINGS</h3>
                    <p>All confirmed active and completed food allocations</p>
                  </div>
                  <span className="count-badge">{activeBookings.length + completedDonations.length} Bookings</span>
                </div>

                {activeBookings.length + completedDonations.length === 0 ? (
                  <div className="empty-state">
                    <div style={{ fontSize: "36px", marginBottom: "10px" }}>🤝</div>
                    <h3>No bookings recorded yet.</h3>
                  </div>
                ) : (
                  <div className="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>Food</th>
                          <th>Donor</th>
                          <th>Receiver</th>
                          <th>Quantity</th>
                          <th>Booking Date</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...activeBookings, ...completedDonations].map((b) => (
                          <tr key={b.id}>
                            <td>
                              <strong>{b.food_name}</strong>
                            </td>
                            <td>👤 {b.donor_name}</td>
                            <td>🤝 {b.receiver_name}</td>
                            <td>
                              <strong style={{ color: "#166534" }}>{b.requested_quantity} meals</strong>
                            </td>
                            <td>🕒 {formatDateTimeDisplay(b.donor_response_at)}</td>
                            <td>
                              <span className={`status ${b.status === "Received" ? "completed" : "booked"}`}>
                                {b.status === "Received" ? "RECEIVED ✅" : "BOOKED"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {/* TAB 6: REGISTERED USERS */}
            {adminTab === "users" && (
              <section className="content-card">
                <div className="section-header">
                  <div>
                    <h3>REGISTERED USERS</h3>
                    <p>Master directory of all registered donors, receivers, and admins</p>
                  </div>
                  <span className="count-badge">{adminUsers.length} Users</span>
                </div>

                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Verification Status</th>
                        <th>Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminUsers.map((u) => {
                        const { role: uRole, status: uStatus } = getUserRoleAndStatus(u);

                        return (
                          <tr key={u.id}>
                            <td>
                              <strong>{u.name}</strong>
                            </td>
                            <td>{u.email}</td>
                            <td>
                              <span className={`role-badge ${uRole}`}>{uRole}</span>
                            </td>
                            <td>
                              <span
                                className={
                                  uStatus === "Verified"
                                    ? "badge-verified"
                                    : uStatus === "Rejected"
                                    ? "badge-rejected"
                                    : "badge-pending"
                                }
                              >
                                {uStatus}
                              </span>
                            </td>
                            <td>🕒 {formatDateTimeDisplay(u.created_at)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* TAB 7: REPORTS & ANALYTICS */}
            {adminTab === "reports" && (
              <>
                <div className="reports-grid">
                  <div className="report-summary-box">
                    <h4>📊 Platform Verification & Community Metrics</h4>
                    <div className="report-metrics-list">
                      <div className="report-metric-item">
                        <span>Total Users</span>
                        <strong>{adminUsers.length}</strong>
                      </div>
                      <div className="report-metric-item">
                        <span>Verified Users</span>
                        <strong style={{ color: "#166534" }}>{verifiedUsers.length}</strong>
                      </div>
                      <div className="report-metric-item">
                        <span>Pending Users</span>
                        <strong style={{ color: "#9a3412" }}>{pendingUsers.length}</strong>
                      </div>
                      <div className="report-metric-item">
                        <span>Rejected Users</span>
                        <strong style={{ color: "#991b1b" }}>{rejectedUsers.length}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="report-summary-box">
                    <h4>🌱 Food Impact & Allocation Metrics</h4>
                    <div className="report-metrics-list">
                      <div className="report-metric-item">
                        <span>Total Donations</span>
                        <strong>{adminDonations.length}</strong>
                      </div>
                      <div className="report-metric-item">
                        <span>Available Food (Meals)</span>
                        <strong style={{ color: "#2563eb" }}>{totalAvailableFood}</strong>
                      </div>
                      <div className="report-metric-item">
                        <span>Active Bookings</span>
                        <strong style={{ color: "#166534" }}>{activeBookings.length}</strong>
                      </div>
                      <div className="report-metric-item">
                        <span>Completed Donations</span>
                        <strong style={{ color: "#86198f" }}>{completedDonations.length}</strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* CSV DOWNLOADS */}
                <section className="export-section-card">
                  <h3 style={{ fontSize: "18px", color: "#183c2a", marginBottom: "6px" }}>
                    📥 Download Real Database Reports (CSV)
                  </h3>
                  <p style={{ fontSize: "13px", color: "#617068" }}>
                    Generate raw CSV reports directly from current Supabase verification and booking records.
                  </p>

                  <div className="export-buttons-group">
                    <button className="export-btn" onClick={handleDownloadUsersCSV}>
                      <span>👥</span>
                      <span>DOWNLOAD USERS CSV</span>
                    </button>
                    <button className="export-btn" onClick={handleDownloadDonationsCSV}>
                      <span>🍲</span>
                      <span>DOWNLOAD DONATIONS CSV</span>
                    </button>
                    <button className="export-btn" onClick={handleDownloadRequestsCSV}>
                      <span>📋</span>
                      <span>DOWNLOAD REQUESTS CSV</span>
                    </button>
                    <button className="export-btn" onClick={handleDownloadBookingsCSV}>
                      <span>🤝</span>
                      <span>DOWNLOAD BOOKINGS CSV</span>
                    </button>
                    <button
                      className="export-btn"
                      style={{ borderColor: "#23653f", background: "#f0fdf4" }}
                      onClick={handleDownloadCompletedDonationsCSV}
                    >
                      <span>📦</span>
                      <span>DOWNLOAD COMPLETED CSV</span>
                    </button>
                  </div>
                </section>
              </>
            )}

            {/* DOCUMENT VIEWER MODAL */}
            {viewingDocUser && (
              <div className="modal-overlay" onClick={() => setViewingDocUser(null)}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                    <h3>Official Document: {viewingDocUser.name}</h3>
                    <button className="close-modal-btn" onClick={() => setViewingDocUser(null)}>
                      ✕
                    </button>
                  </div>

                  <div className="modal-body">
                    <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", marginBottom: "18px", fontSize: "13px" }}>
                      <p><strong>Organization Type:</strong> {viewingDocUser.org_type || "N/A"}</p>
                      <p><strong>Email:</strong> {viewingDocUser.email}</p>
                      <p><strong>Phone:</strong> {viewingDocUser.phone || "N/A"}</p>
                      <p><strong>Address:</strong> {viewingDocUser.address || "N/A"}</p>
                      <p><strong>Licence / Registration Number:</strong> <code>{viewingDocUser.registration_number || "N/A"}</code></p>
                    </div>

                    <div
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: "10px",
                        padding: "20px",
                        textAlign: "center",
                        background: "#f1f5f9",
                        minHeight: "160px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {viewingDocUser.document_data && viewingDocUser.document_data.startsWith("data:image") ? (
                        <img
                          src={viewingDocUser.document_data}
                          alt="Licence Preview"
                          style={{ maxWidth: "100%", maxHeight: "240px", borderRadius: "8px" }}
                        />
                      ) : (
                        <>
                          <span style={{ fontSize: "40px", marginBottom: "8px" }}>📄</span>
                          <strong style={{ fontSize: "14px", color: "#1e293b" }}>
                            {viewingDocUser.document_name || "Official_Registration_Document.pdf"}
                          </strong>
                          <p style={{ fontSize: "12px", color: "#64748b", margin: "4px 0 12px" }}>
                            Verified Official Document Upload
                          </p>
                          {viewingDocUser.document_data && (
                            <a
                              href={viewingDocUser.document_data}
                              download={viewingDocUser.document_name || "document.pdf"}
                              className="hero-btn-primary"
                              style={{ padding: "6px 16px", fontSize: "12px", textDecoration: "none" }}
                            >
                              Download Document
                            </a>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="modal-footer">
                    <button className="reject-action-btn" onClick={() => setShowRejectPromptForUser(viewingDocUser)}>
                      REJECT
                    </button>
                    <button className="verify-action-btn" onClick={() => handleVerifyUser(viewingDocUser)}>
                      VERIFY
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* REJECTION REASON MODAL */}
            {showRejectPromptForUser && (
              <div className="modal-overlay" onClick={() => setShowRejectPromptForUser(null)}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "460px" }}>
                  <div className="modal-header">
                    <h3>Reject User: {showRejectPromptForUser.name}</h3>
                    <button className="close-modal-btn" onClick={() => setShowRejectPromptForUser(null)}>
                      ✕
                    </button>
                  </div>

                  <div className="modal-body">
                    <p style={{ fontSize: "13px", color: "#475569", marginBottom: "14px" }}>
                      Enter an optional rejection reason to display to this user:
                    </p>
                    <textarea
                      rows="3"
                      placeholder="e.g. Invalid FSSAI licence number / Document illegible"
                      value={rejectReasonInput}
                      onChange={(e) => setRejectReasonInput(e.target.value)}
                      style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                    />
                  </div>

                  <div className="modal-footer">
                    <button className="outline-btn" onClick={() => setShowRejectPromptForUser(null)}>
                      Cancel
                    </button>
                    <button
                      className="reject-action-btn"
                      onClick={() => handleRejectUserWithReason(showRejectPromptForUser, rejectReasonInput)}
                    >
                      Confirm Rejection
                    </button>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      );
    }

    return null;
  };

  return (
    <>
      {renderView()}
      <DbBadge status={dbStatus} />
    </>
  );
}

// =========================================================================
// SUB-COMPONENTS
// =========================================================================

function DbBadge({ status }) {
  const isConnected = status === "Database Connected";
  const isFailed = status === "Database Connection Failed";

  return (
    <div
      style={{
        position: "fixed",
        bottom: "16px",
        right: "16px",
        padding: "6px 14px",
        borderRadius: "20px",
        fontSize: "12px",
        fontWeight: "600",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        zIndex: 99999,
        backgroundColor: isConnected ? "#ecfdf5" : isFailed ? "#fef2f2" : "#f3f4f6",
        color: isConnected ? "#065f46" : isFailed ? "#991b1b" : "#374151",
        border: `1px solid ${isConnected ? "#a7f3d0" : isFailed ? "#fecaca" : "#e5e7eb"}`,
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
        backdropFilter: "blur(8px)",
      }}
    >
      <span
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          backgroundColor: isConnected ? "#10b981" : isFailed ? "#ef4444" : "#9ca3af",
          display: "inline-block",
        }}
      />
      {status}
    </div>
  );
}

export default App;
