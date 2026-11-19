import { supabase } from "./supabase-client.js";

const authGate = document.getElementById("auth-gate");
const authLoading = document.getElementById("auth-loading");
const loginView = document.getElementById("login-view");
const appContent = document.getElementById("app-content");

const loginForm = document.getElementById("login-form");
const loginEmail = document.getElementById("login-email");
const loginPassword = document.getElementById("login-password");
const loginButton = document.getElementById("login-submit");
const authMessage = document.getElementById("auth-message");
const logoutButton = document.getElementById("logout-button");
const authUser = document.getElementById("auth-user");

function showLogin(message = "") {
  authGate.hidden = false;
  authLoading.hidden = true;
  loginView.hidden = false;
  appContent.hidden = true;

  authMessage.textContent = message;
  authMessage.hidden = !message;
}

function showApp(user) {
  authGate.hidden = true;
  appContent.hidden = false;

  if (authUser) {
    authUser.textContent = user.email || "";
  }
}

async function initializeAuthentication() {
  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) throw error;

    if (data.session) {
      showApp(data.session.user);
    } else {
      showLogin();
    }
  } catch (error) {
    console.error("Authentication error:", error);
    showLogin("Não foi possível verificar a sessão.");
  }
}

// Login
loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  loginButton.disabled = true;
  authMessage.hidden = true;

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginEmail.value.trim(),
      password: loginPassword.value
    });

    if (error) throw error;

    showApp(data.user);
    loginPassword.value = "";

  } catch (error) {
    authMessage.textContent = error.message;
    authMessage.hidden = false;
  } finally {
    loginButton.disabled = false;
  }
});

// Logout
logoutButton?.addEventListener("click", async () => {
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error(error);
    return;
  }

  showLogin();
});

// Mostrar / esconder senha
const passwordToggle = document.getElementById("password-toggle");

passwordToggle?.addEventListener("click", () => {
  const isPassword = loginPassword.type === "password";

  loginPassword.type = isPassword ? "text" : "password";
  passwordToggle.textContent = isPassword ? "OCULTAR" : "MOSTRAR";
  passwordToggle.setAttribute("aria-pressed", String(isPassword));
});

// Atualizar a interface quando a sessão mudar.
supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" || !session) {
    showLogin();
  } else {
    showApp(session.user);
  }
});

initializeAuthentication();