import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  query as fbQuery,
  orderBy,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
const db = getFirestore(app);

// Page elements & state
const pages = {};
let workoutDays = [];
let currentPlan = {};
const today = new Date().toISOString().split("T")[0];

window.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, binding buttons…');

  // Register Chart.js components
  if (window.Chart && Chart.registerables) {
    Chart.register(...Chart.registerables);
  }

  // Map pages
  pages.welcome  = document.getElementById("welcome-page");
  pages.setup    = document.getElementById("setup-page");
  pages.naming   = document.getElementById("day-naming-page");
  pages.exercise = document.getElementById("exercise-setup-page");
  pages.dashboard= document.getElementById("dashboard-page");

  function showPage(name) {
    Object.values(pages).forEach(p => p.classList.remove("active"));
    pages[name].classList.add("active");
  }

  // Navigation
  document.getElementById("get-started-btn")
    .addEventListener("click", () => showPage("setup"));

  document.getElementById("next-to-naming")
    .addEventListener("click", () => {
      const days = +document.getElementById("daysPerWeek").value;
      const form = document.getElementById("day-names-form");
      form.innerHTML = "";
      for (let i = 1; i <= days; i++) {
        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = `Workout Day ${i}`;
        input.required = true;
        form.appendChild(input);
      }
      showPage("naming");
    });

  document.getElementById("to-exercise-btn")
    .addEventListener("click", () => {
      const dayInputs = document.querySelectorAll("#day-names-form input");
      workoutDays = Array.from(dayInputs)
        .map(i => i.value.trim())
        .filter(Boolean);

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

      document.querySelectorAll(".add-exercise-btn")
        .forEach(btn =>
          btn.addEventListener("click", e => {
            const list = e.target.previousElementSibling;
            const div  = document.createElement("div");
            div.innerHTML = `
              <input type="text" placeholder="Exercise Name" class="exercise-name" />
              <div class="set-entry">
                <input type="number" placeholder="Sets" class="sets" />
                <input type="number" placeholder="Reps" class="reps" />
                <input type="number" placeholder="Weight (kg)" class="weight" />
              </div>
            `;
            list.appendChild(div);
          })
        );

      showPage("exercise");
    });

  // Finish setup
  document.getElementById("finish-setup-btn")
    .addEventListener("click", async () => {
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

      // Render Dashboard
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

      initSessionLogger();
      initBodyweightLogger();

      try {
        await addDoc(collection(db, "workouts"), {
          timestamp: Date.now(),
          plan
        });
      } catch (e) {
        console.warn("Save plan failed:", e);
      }
    });

  // Session Logger
  async function loadSessions() {
    const q   = fbQuery(collection(db, "sessions"), orderBy("date", "asc"));
    const snap= await getDocs(q);
    const map = {};
    const list= document.getElementById("workouts-list");
    list.innerHTML = "";

    snap.forEach(doc => {
      const d = new Date(doc.data().date).toISOString().split("T")[0];
      map[d] = (map[d] || 0) + 1;
    });

    const labels = [], counts = [];
    Object.entries(map).forEach(([d,c]) => {
      labels.push(d);
      counts.push(c);
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
      if (!dateInput.value) return alert("Select a date");
      await addDoc(collection(db, "sessions"), {
        date: new Date(dateInput.value).getTime(),
        plan: currentPlan
      });
      loadSessions();
    };
    loadSessions();
  }

  // Bodyweight Logger
  async function loadWeights() {
    const q    = fbQuery(collection(db, "weights"), orderBy("date", "asc"));
    const snap = await getDocs(q);
    const labels = [], data = [];
    const list = document.getElementById("weights-list");
    list.innerHTML = "";

    snap.forEach(doc => {
      const w = doc.data();
      const d = new Date(w.date).toISOString().split("T")[0];
      labels.push(d);
      data.push(w.weight);
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
      await addDoc(collection(db, "weights"), {
        date: new Date(d).getTime(),
        weight: w
      });
      weightInput.value = "";
      loadWeights();
    };
    loadWeights();
  }
});
