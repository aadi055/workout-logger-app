import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, query as fbQuery,
  orderBy, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, OAuthProvider,
  signInWithPopup, signInAnonymously,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCtIE96qUzK38HmXgKyglQhIAfIrvkdgMc",
  authDomain: "workoutloggerapp.firebaseapp.com",
  projectId: "workoutloggerapp",
  storageBucket: "workoutloggerapp.firebasestorage.app",
  messagingSenderId: "761376533993",
  appId: "1:761376533993:web:9c31a72349ca1f03ac6f78",
  measurementId: "G-KNJMHGE3FC"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Page references
const pages = {};
let workoutDays = [], currentPlan = {};
const today = new Date().toISOString().split("T")[0];

window.addEventListener('DOMContentLoaded', () => {
  // Map pages
  pages.auth      = document.getElementById("auth-page");
  pages.welcome   = document.getElementById("welcome-page");
  pages.setup     = document.getElementById("setup-page");
  pages.naming    = document.getElementById("day-naming-page");
  pages.exercise  = document.getElementById("exercise-setup-page");
  pages.dashboard = document.getElementById("dashboard-page");

  function showPage(name) {
    Object.values(pages).forEach(p => p.classList.remove("active"));
    pages[name].classList.add("active");
  }

  // AUTH BUTTONS
  document.getElementById("google-btn").onclick = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };
  document.getElementById("apple-btn").onclick = async () => {
    const provider = new OAuthProvider('apple.com');
    await signInWithPopup(auth, provider);
  };
  document.getElementById("guest-btn").onclick = async () => {
    await signInAnonymously(auth);
  };
  document.getElementById("sign-out-btn").onclick = () => {
    signOut(auth);
  };

  // REACT TO AUTH STATE
  onAuthStateChanged(auth, user => {
    if (user) {
      showPage("welcome");
    } else {
      showPage("auth");
    }
  });

  // WELCOME → SETUP
  document.getElementById("get-started-btn").onclick = () => showPage("setup");

  // SETUP → NAMING
  document.getElementById("next-to-naming").onclick = () => {
    const days = +document.getElementById("daysPerWeek").value;
    const form = document.getElementById("day-names-form");
    form.innerHTML = "";
    workoutDays = [];
    for (let i = 1; i <= days; i++) {
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = `Workout Day ${i}`;
      input.required = true;
      form.appendChild(input);
    }
    showPage("naming");
  };

  // NAMING → EXERCISE SETUP
  document.getElementById("to-exercise-btn").onclick = () => {
    const dayInputs = document.querySelectorAll("#day-names-form input");
    workoutDays = Array.from(dayInputs).map(i=>i.value.trim()).filter(Boolean);
    const container = document.getElementById("exercise-forms-container");
    container.innerHTML = "";
    workoutDays.forEach(day => {
      const block = document.createElement("div");
      block.className = "exercise-block";
      block.innerHTML = `
        <h3>${day}</h3>
        <div class="exercise-list" data-day="${day}"></div>
        <button class="add-exercise-btn">Add Exercise</button>
      `;
      container.appendChild(block);
    });
    document.querySelectorAll(".add-exercise-btn").forEach(btn => {
      btn.onclick = () => {
        const list = btn.previousElementSibling;
        const div = document.createElement("div");
        div.innerHTML = `
          <input type="text" placeholder="Exercise Name" class="exercise-name"/>
          <div class="set-entry">
            <input type="number" placeholder="Sets" class="sets"/>
            <input type="number" placeholder="Reps" class="reps"/>
            <input type="number" placeholder="Weight (kg)" class="weight"/>
          </div>
        `;
        list.appendChild(div);
      };
    });
    showPage("exercise");
  };

  // FINISH SETUP → DASHBOARD + SAVE
  document.getElementById("finish-setup-btn").onclick = async () => {
    const uid = auth.currentUser.uid;
    const plan = {};
    workoutDays.forEach(day => {
      const list = document.querySelector(`.exercise-list[data-day="${day}"]`);
      plan[day] = Array.from(list.children).map(exDiv => ({
        name:   exDiv.querySelector(".exercise-name").value.trim() || "Unnamed",
        sets:   exDiv.querySelector(".sets").value || 0,
        reps:   exDiv.querySelector(".reps").value || 0,
        weight: exDiv.querySelector(".weight").value || 0
      }));
    });
    currentPlan = plan;

    // Render dashboard
    const dash = document.getElementById("dashboard-content");
    dash.innerHTML = "";
    workoutDays.forEach(day => {
      const section = document.createElement("div");
      section.innerHTML = `<h3>${day}</h3>`;
      const ul = document.createElement("ul");
      plan[day].forEach(item => {
        const li = document.createElement("li");
        li.textContent = `${item.name}: ${item.sets}×${item.reps} @ ${item.weight}kg`;
        ul.appendChild(li);
      });
      section.appendChild(ul);
      dash.appendChild(section);
    });
    showPage("dashboard");

    // Save to Firestore under user
    await addDoc(
      collection(db, "users", uid, "workouts"),
      { timestamp: Date.now(), plan }
    );

    initSessionLogger();
    initBodyweightLogger();
  };

  // SESSION LOGGER
  async function loadSessions() {
    const uid = auth.currentUser.uid;
    const q = fbQuery(collection(db, "users", uid, "sessions"), orderBy("date", "asc"));
    const snap = await getDocs(q);
    const map = {}, list = document.getElementById("workouts-list");
    list.innerHTML = "";
    snap.forEach(doc => {
      const d = new Date(doc.data().date).toISOString().split("T")[0];
      map[d] = (map[d] || 0) + 1;
    });
    const labels = [], counts = [];
    Object.entries(map).forEach(([d,c]) => {
      labels.push(d); counts.push(c);
      const div = document.createElement("div");
      div.innerHTML = `<strong>${d}</strong>: ${c} session(s)`;
      list.appendChild(div);
    });
    const ctx = document.getElementById("workout-chart").getContext("2d");
    if (window.workoutChart) workoutChart.destroy();
    window.workoutChart = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets: [{ label: "Workouts", data: counts }] },
      options: {
        scales: {
          x: { title: { display: true, text: "Date" } },
          y: { beginAtZero: true, title: { display: true, text: "Count" } }
        }
      }
    });
  }
  function initSessionLogger() {
    const dateInput = document.getElementById("session-date");
    dateInput.value = today;
    document.getElementById("save-session-btn").onclick = async () => {
      const d = dateInput.value;
      if (!d) return alert("Select a date");
      await addDoc(collection(db, "users", auth.currentUser.uid, "sessions"), {
        date: new Date(d).getTime(), plan: currentPlan
      });
      loadSessions();
    };
    loadSessions();
  }

  // BODYWEIGHT LOGGER
  async function loadWeights() {
    const uid = auth.currentUser.uid;
    const q = fbQuery(collection(db, "users", uid, "weights"), orderBy("date", "asc"));
    const snap = await getDocs(q);
    const labels = [], data = [];
    const list = document.getElementById("weights-list");
    list.innerHTML = "";
    snap.forEach(doc => {
      const w = doc.data();
      const d = new Date(w.date).toISOString().split("T")[0];
      labels.push(d); data.push(w.weight);
      const div = document.createElement("div");
      div.innerHTML = `<strong>${d}</strong>: ${w.weight} kg`;
      list.appendChild(div);
    });
    const ctx = document.getElementById("weight-chart").getContext("2d");
    if (window.weightChart) weightChart.destroy();
    window.weightChart = new Chart(ctx, {
      type: "line",
      data: { labels, datasets: [{ label: "Bodyweight (kg)", data, fill: false, tension: 0.1 }] },
      options: {
        scales: {
          x: { title: { display: true, text: "Date" } },
          y: { title: { display: true, text: "Weight (kg)" } }
        }
      }
    });
  }
  function initBodyweightLogger() {
    const dateInput   = document.getElementById("weight-date");
    const weightInput = document.getElementById("weight-input");
    dateInput.value = today;
    document.getElementById("save-weight-btn").onclick = async () => {
      const d = dateInput.value, w = parseFloat(weightInput.value);
      if (!d || !w) return alert("Enter date and weight");
      await addDoc(collection(db, "users", auth.currentUser.uid, "weights"), {
        date: new Date(d).getTime(), weight: w
      });
      weightInput.value = "";
      loadWeights();
    };
    loadWeights();
  }
});
