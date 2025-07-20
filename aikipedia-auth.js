// Sidebar and Auth Modal Logic for Aikipedia (shared)
(function() {
  const profileToggle = document.getElementById("profileToggle");
  const sidebar = document.getElementById("sidebar");
  const sidebarOverlay = document.getElementById("sidebarOverlay");
  const profileDetails = document.getElementById("profileDetails");
  const authButtons = document.getElementById("authButtons");
  const loginBtn = document.getElementById("loginBtn");
  const registerBtn = document.getElementById("registerBtn");
  const authModal = document.getElementById("authModal");
  const loginUsername = document.getElementById("loginUsername");
  const loginPassword = document.getElementById("loginPassword");
  const loginSubmitBtn = document.getElementById("loginSubmitBtn");
  const switchToRegisterBtn = document.getElementById("switchToRegisterBtn");
  const loginCancelBtn = document.getElementById("loginCancelBtn");
  const loginError = document.getElementById("loginError");
  const registerUsername = document.getElementById("registerUsername");
  const registerPassword = document.getElementById("registerPassword");
  const registerConfirmPassword = document.getElementById("registerConfirmPassword");
  const registerSubmitBtn = document.getElementById("registerSubmitBtn");
  const switchToLoginBtn = document.getElementById("switchToLoginBtn");
  const registerCancelBtn = document.getElementById("registerCancelBtn");
  const registerError = document.getElementById("registerError");
  const logoutBtn = document.getElementById("logoutBtn");

  let loggedInUser = null;
  let loggedInUserId = null;
  let authMode = "login";
  document.getElementById("aboutUsBtn").onclick = function() {
    window.location.href = "about_us.html";
  };
  document.getElementById("apiBtn").onclick = function() {
    window.location.href = "api.html";
  };
  document.getElementById("paymentsBtn").onclick = function() {
    window.location.href = "payments.html";
  };
  document.getElementById("chatBtn").onclick = function() {
    window.location.href = "chat.html";
  };

  function checkStoredSession() {
    const storedUser = localStorage.getItem('aikipediaUser');
    const storedUserId = localStorage.getItem('aikipediaUserId');
    if (storedUser && storedUserId) {
      setLoggedInUser(storedUser, storedUserId);
      return true;
    }
    return false;
  }
  function setLoggedInUser(username, userId) {
    loggedInUser = username;
    loggedInUserId = userId;
    localStorage.setItem('aikipediaUser', username);
    localStorage.setItem('aikipediaUserId', userId);
    profileDetails.textContent = `Hello, ${username}`;
    profileToggle.textContent = username.charAt(0).toUpperCase();
    authButtons.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "block";
  }
  function setLoggedOut() {
    loggedInUser = null;
    loggedInUserId = null;
    localStorage.removeItem('aikipediaUser');
    localStorage.removeItem('aikipediaUserId');
    profileDetails.textContent = `Hello, Guest`;
    profileToggle.textContent = "G";
    authButtons.style.display = "flex";
    if (logoutBtn) logoutBtn.style.display = "none";
  }
  // Password visibility toggle logic
  function setupPasswordToggles() {
    const toggles = document.querySelectorAll('.toggle-password');
    toggles.forEach(toggle => {
      toggle.onclick = function() {
        const targetId = this.getAttribute('data-target');
        const input = document.getElementById(targetId);
        if (input) {
          if (input.type === 'password') {
            input.type = 'text';
            this.querySelector('svg').style.stroke = '#4889cd'; // highlight when visible
          } else {
            input.type = 'password';
            this.querySelector('svg').style.stroke = '#888';
          }
        }
      };
    });
  }
  // Call on DOMContentLoaded and after modal switches
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupPasswordToggles);
  } else {
    setupPasswordToggles();
  }
  loginBtn.onclick = () => {
    document.getElementById("loginForm").style.display = "flex";
    document.getElementById("registerForm").style.display = "none";
    authModal.style.display = "flex";
    document.getElementById("loginForm").style.transform = "translateY(-20px)";
    setTimeout(() => {
      document.getElementById("loginForm").style.transform = "translateY(0)";
      setupPasswordToggles();
    }, 10);
  };
  registerBtn.onclick = () => {
    document.getElementById("loginForm").style.display = "none";
    document.getElementById("registerForm").style.display = "flex";
    authModal.style.display = "flex";
    document.getElementById("registerForm").style.transform = "translateY(-20px)";
    setTimeout(() => {
      document.getElementById("registerForm").style.transform = "translateY(0)";
      setupPasswordToggles();
    }, 10);
  };
  document.getElementById("switchToRegisterBtn").onclick = () => {
    document.getElementById("loginForm").style.transform = "translateY(-20px)";
    setTimeout(() => {
      document.getElementById("loginForm").style.display = "none";
      document.getElementById("registerForm").style.display = "flex";
      document.getElementById("registerForm").style.transform = "translateY(-20px)";
      setTimeout(() => {
        document.getElementById("registerForm").style.transform = "translateY(0)";
        setupPasswordToggles();
      }, 10);
    }, 300);
  };
  document.getElementById("switchToLoginBtn").onclick = () => {
    document.getElementById("registerForm").style.transform = "translateY(-20px)";
    setTimeout(() => {
      document.getElementById("registerForm").style.display = "none";
      document.getElementById("loginForm").style.display = "flex";
      document.getElementById("loginForm").style.transform = "translateY(-20px)";
      setTimeout(() => {
        document.getElementById("loginForm").style.transform = "translateY(0)";
        setupPasswordToggles();
      }, 10);
    }, 300);
  };
  document.getElementById("loginCancelBtn").onclick = () => {
    document.getElementById("loginForm").style.transform = "translateY(-20px)";
    setTimeout(() => {
      authModal.style.display = "none";
    }, 300);
  };
  document.getElementById("registerCancelBtn").onclick = () => {
    document.getElementById("registerForm").style.transform = "translateY(-20px)";
    setTimeout(() => {
      authModal.style.display = "none";
    }, 300);
  };
  const authInputs = document.querySelectorAll("#authModal input");
  authInputs.forEach(input => {
    input.addEventListener("focus", () => {
      input.style.borderColor = "#4889cd";
    });
    input.addEventListener("blur", () => {
      input.style.borderColor = "#000137";
    });
  });
  const modalAuthButtons = document.querySelectorAll("#authModal button");
  modalAuthButtons.forEach(button => {
    if (!button.id.includes("Cancel") && !button.id.includes("switch")) {
      button.addEventListener("mouseover", () => {
        button.style.transform = "translateY(-2px)";
        button.style.boxShadow = "0 5px 15px rgba(0,0,0,0.2)";
      });
      button.addEventListener("mouseout", () => {
        button.style.transform = "translateY(0)";
        button.style.boxShadow = "none";
      });
    }
  });
  document.getElementById("loginSubmitBtn").onclick = async () => {
    const username = document.getElementById("loginUsername").value.trim();
    const password = document.getElementById("loginPassword").value.trim();
    if (!username || !password) {
      document.getElementById("loginError").textContent = "Please fill in all fields";
      return;
    }
    document.getElementById("loginError").textContent = "";
    document.getElementById("loginSubmitBtn").disabled = true;
    try {
      const res = await fetch("https://backend.aikipedia.workers.dev/flask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", username, password })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Login failed");
      }
      setLoggedInUser(username, data.user_id);
      authModal.style.display = "none";
    } catch (err) {
      let errorMsg;
      if (err && err.message) {
        errorMsg = err.message;
      } else if (err && err.error) {
        if (typeof err.error === 'object') {
          errorMsg = JSON.stringify(err.error, null, 2);
        } else {
          errorMsg = String(err.error);
        }
      } else if (typeof err === "object") {
        errorMsg = JSON.stringify(err, null, 2);
      } else {
        errorMsg = String(err);
      }
      document.getElementById("loginError").textContent = errorMsg;
    } finally {
      document.getElementById("loginSubmitBtn").disabled = false;
    }
  };
  document.getElementById("registerSubmitBtn").onclick = async () => {
    const username = document.getElementById("registerUsername").value.trim();
    const password = document.getElementById("registerPassword").value.trim();
    const confirmPassword = document.getElementById("registerConfirmPassword").value.trim();
    if (!username || !password || !confirmPassword) {
      document.getElementById("registerError").textContent = "Please fill in all fields";
      return;
    }
    if (password !== confirmPassword) {
      document.getElementById("registerError").textContent = "Passwords do not match";
      return;
    }
    document.getElementById("registerError").textContent = "";
    document.getElementById("registerSubmitBtn").disabled = true;
    try {
      const res = await fetch("https://backend.aikipedia.workers.dev/flask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "register", username, password })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Registration failed");
      }
      setLoggedInUser(username, data.user_id);
      authModal.style.display = "none";
    } catch (err) {
      let errorMsg;
      if (err && err.message) {
        errorMsg = err.message;
      } else if (err && err.error) {
        if (typeof err.error === 'object') {
          errorMsg = JSON.stringify(err.error, null, 2);
        } else {
          errorMsg = String(err.error);
        }
      } else if (typeof err === "object") {
        errorMsg = JSON.stringify(err, null, 2);
      } else {
        errorMsg = String(err);
      }
      document.getElementById("registerError").textContent = errorMsg;
    } finally {
      document.getElementById("registerSubmitBtn").disabled = false;
    }
  };
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      setLoggedOut();
    };
  }
  profileToggle.addEventListener("click", () => {
    const isVisible = sidebar.classList.contains("visible");
    if (!isVisible) {
      sidebar.classList.add("visible");
      sidebarOverlay.classList.add("visible");
    } else {
      sidebar.classList.remove("visible");
      sidebarOverlay.classList.remove("visible");
    }
  });
  sidebarOverlay.addEventListener("click", () => {
    sidebar.classList.remove("visible");
    sidebarOverlay.classList.remove("visible");
  });
  window.addEventListener("DOMContentLoaded", async () => {
    checkStoredSession();
  });
})(); 