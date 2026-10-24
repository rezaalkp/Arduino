(() => {
  "use strict";

  const DT = 0.02; // 20 ms sample
  const WINDOW_S = 10;
  const MAX_SAMPLES = Math.ceil(WINDOW_S / DT) + 2;

  const el = {
    btnRun: document.getElementById("btnRun"),
    btnPause: document.getElementById("btnPause"),
    btnReset: document.getElementById("btnReset"),
    btnStep: document.getElementById("btnStep"),
    setpoint: document.getElementById("setpoint"),
    kp: document.getElementById("kp"),
    ki: document.getElementById("ki"),
    kd: document.getElementById("kd"),
    gain: document.getElementById("gain"),
    tau: document.getElementById("tau"),
    delay: document.getElementById("delay"),
    disturb: document.getElementById("disturb"),
    noise: document.getElementById("noise"),
    oSp: document.getElementById("oSp"),
    oKp: document.getElementById("oKp"),
    oKi: document.getElementById("oKi"),
    oKd: document.getElementById("oKd"),
    oGain: document.getElementById("oGain"),
    oTau: document.getElementById("oTau"),
    oDelay: document.getElementById("oDelay"),
    oDist: document.getElementById("oDist"),
    mSetpoint: document.getElementById("mSetpoint"),
    mError: document.getElementById("mError"),
    mControl: document.getElementById("mControl"),
    mCtrlState: document.getElementById("mCtrlState"),
    mOutput: document.getElementById("mOutput"),
    mDisturb: document.getElementById("mDisturb"),
    mPlantU: document.getElementById("mPlantU"),
    mPlantState: document.getElementById("mPlantState"),
    logController: document.getElementById("logController"),
    logPlant: document.getElementById("logPlant"),
    ledController: document.getElementById("ledController"),
    ledPlant: document.getElementById("ledPlant"),
    boardController: document.getElementById("boardController"),
    boardPlant: document.getElementById("boardPlant"),
    scope: document.getElementById("scope"),
    scopeTime: document.getElementById("scopeTime"),
    statusList: document.getElementById("statusList"),
    chSp: document.getElementById("chSp"),
    chFb: document.getElementById("chFb"),
    chU: document.getElementById("chU"),
    chE: document.getElementById("chE"),
  };

  const state = {
    running: false,
    t: 0,
    y: 0,
    u: 0,
    integral: 0,
    prevError: 0,
    delayBuf: [],
    hist: { t: [], sp: [], y: [], u: [], e: [] },
    ctrlLines: [],
    plantLines: [],
    raf: 0,
    acc: 0,
    lastTs: 0,
  };

  function num(input) {
    return Number(input.value);
  }

  function syncOutputs() {
    el.oSp.textContent = num(el.setpoint).toFixed(1);
    el.oKp.textContent = num(el.kp).toFixed(2);
    el.oKi.textContent = num(el.ki).toFixed(2);
    el.oKd.textContent = num(el.kd).toFixed(2);
    el.oGain.textContent = num(el.gain).toFixed(2);
    el.oTau.textContent = num(el.tau).toFixed(2);
    el.oDelay.textContent = num(el.delay).toFixed(2);
    el.oDist.textContent = String(num(el.disturb));
  }

  function pushLog(target, line, buf) {
    buf.push(line);
    if (buf.length > 5) buf.shift();
    target.textContent = buf.join("\n");
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function stepOnce() {
    const sp = num(el.setpoint);
    const kp = num(el.kp);
    const ki = num(el.ki);
    const kd = num(el.kd);
    const K = num(el.gain);
    const tau = Math.max(0.05, num(el.tau));
    const delayS = Math.max(0, num(el.delay));
    const d = num(el.disturb);

    // --- Arduino 1: PID controller ---
    const measured = state.y + (el.noise.checked ? (Math.random() - 0.5) * 1.2 : 0);
    const error = sp - measured;
    state.integral += error * DT;
    state.integral = clamp(state.integral, -80, 80);
    const derivative = (error - state.prevError) / DT;
    let u = kp * error + ki * state.integral + kd * derivative;
    u = clamp(u, 0, 100);
    state.prevError = error;
    state.u = u;

    // --- Transport delay buffer (plant input) ---
    const delaySamples = Math.round(delayS / DT);
    state.delayBuf.push(u);
    while (state.delayBuf.length > delaySamples + 1) state.delayBuf.shift();
    const uDelayed = state.delayBuf.length > delaySamples ? state.delayBuf[0] : 0;

    // --- Arduino 2: first-order plant dy/dt = (-y + K*u + d) / tau ---
    const alpha = DT / (tau + DT);
    state.y = state.y + alpha * (K * uDelayed + d - state.y);
    state.y = clamp(state.y, -20, 140);
    state.t += DT;

    // history
    state.hist.t.push(state.t);
    state.hist.sp.push(sp);
    state.hist.y.push(state.y);
    state.hist.u.push(u);
    state.hist.e.push(error);
    if (state.hist.t.length > MAX_SAMPLES) {
      state.hist.t.shift();
      state.hist.sp.shift();
      state.hist.y.shift();
      state.hist.u.shift();
      state.hist.e.shift();
    }

    // UI metrics
    el.mSetpoint.textContent = sp.toFixed(2);
    el.mError.textContent = error.toFixed(2);
    el.mControl.textContent = u.toFixed(2);
    el.mOutput.textContent = state.y.toFixed(2);
    el.mDisturb.textContent = d.toFixed(2);
    el.mPlantU.textContent = uDelayed.toFixed(2);
    el.scopeTime.textContent = `t = ${state.t.toFixed(2)} s`;

    if (Math.floor(state.t / DT) % 8 === 0) {
      pushLog(
        el.logController,
        `SP=${sp.toFixed(1)} E=${error.toFixed(1)} U=${u.toFixed(1)} Kp=${kp.toFixed(2)}`,
        state.ctrlLines
      );
      pushLog(
        el.logPlant,
        `Uin=${uDelayed.toFixed(1)} Y=${state.y.toFixed(1)} D=${d.toFixed(1)} tau=${tau.toFixed(1)}`,
        state.plantLines
      );
    }

    drawScope();
  }

  function drawScope() {
    const canvas = el.scope;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    const padL = 48;
    const padR = 16;
    const padT = 16;
    const padB = 28;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0f1a1f";
    ctx.fillRect(0, 0, w, h);

    // grid
    ctx.strokeStyle = "rgba(90, 140, 150, 0.22)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      const x = padL + (plotW * i) / 10;
      const y = padT + (plotH * i) / 10;
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
    }

    // axes labels
    ctx.fillStyle = "#8aa3ad";
    ctx.font = "12px JetBrains Mono, monospace";
    ctx.textAlign = "right";
    for (let i = 0; i <= 5; i++) {
      const v = 100 - i * 20;
      const y = padT + (plotH * i) / 5;
      ctx.fillText(String(v), padL - 8, y + 4);
    }
    ctx.textAlign = "center";
    ctx.fillText("مقدار", padL / 2, padT + plotH / 2);
    ctx.fillText("زمان (پنجره ۱۰ ثانیه)", padL + plotW / 2, h - 8);

    const n = state.hist.t.length;
    if (n < 2) return;

    const t0 = state.hist.t[n - 1] - WINDOW_S;
    const yToPix = (v) => padT + plotH * (1 - clamp(v, -20, 120) / 100);
    const tToPix = (t) => padL + ((t - t0) / WINDOW_S) * plotW;

    function strokeSeries(arr, color, enabled) {
      if (!enabled) return;
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      let started = false;
      for (let i = 0; i < n; i++) {
        const t = state.hist.t[i];
        if (t < t0) continue;
        const x = tToPix(t);
        const y = yToPix(arr[i]);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    strokeSeries(state.hist.sp, "#e8b84a", el.chSp.checked);
    strokeSeries(state.hist.y, "#3dd6c3", el.chFb.checked);
    strokeSeries(state.hist.u, "#f07178", el.chU.checked);
    strokeSeries(state.hist.e, "#9aa5b1", el.chE.checked);

    // scan beam
    if (state.running && n > 0) {
      const x = tToPix(state.hist.t[n - 1]);
      ctx.strokeStyle = "rgba(61, 214, 195, 0.35)";
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
    }
  }

  function setRunning(on) {
    state.running = on;
    el.btnRun.disabled = on;
    el.btnPause.disabled = !on;
    el.ledController.classList.toggle("on", on);
    el.ledPlant.classList.toggle("on", on);
    el.boardController.classList.toggle("running", on);
    el.boardPlant.classList.toggle("running", on);
    el.mCtrlState.textContent = on ? "در حال کنترل" : "متوقف";
    el.mPlantState.textContent = on ? "در حال شبیه‌سازی" : "متوقف";
    el.statusList.innerHTML = `
      <li>حالت: ${on ? "حلقه بسته فعال" : "آماده‌به‌کار"}</li>
      <li>نمونه: هر ${(DT * 1000).toFixed(0)} میلی‌ثانیه</li>
      <li>مدل: مرتبه اول + تأخیر</li>
      <li>Kp=${num(el.kp).toFixed(2)} · Ki=${num(el.ki).toFixed(2)} · Kd=${num(el.kd).toFixed(2)}</li>
    `;
    if (on) {
      state.lastTs = performance.now();
      state.acc = 0;
      loop(state.lastTs);
    } else if (state.raf) {
      cancelAnimationFrame(state.raf);
      state.raf = 0;
    }
  }

  function loop(ts) {
    if (!state.running) return;
    const dtMs = Math.min(50, ts - state.lastTs);
    state.lastTs = ts;
    state.acc += dtMs;
    while (state.acc >= DT * 1000) {
      stepOnce();
      state.acc -= DT * 1000;
    }
    state.raf = requestAnimationFrame(loop);
  }

  function resetSim() {
    setRunning(false);
    state.t = 0;
    state.y = 0;
    state.u = 0;
    state.integral = 0;
    state.prevError = 0;
    state.delayBuf = [];
    state.hist = { t: [], sp: [], y: [], u: [], e: [] };
    state.ctrlLines = [];
    state.plantLines = [];
    el.logController.textContent = "";
    el.logPlant.textContent = "";
    el.mSetpoint.textContent = "0.00";
    el.mError.textContent = "0.00";
    el.mControl.textContent = "0.00";
    el.mOutput.textContent = "0.00";
    el.mDisturb.textContent = "0.00";
    el.mPlantU.textContent = "0.00";
    el.mCtrlState.textContent = "آماده";
    el.mPlantState.textContent = "آماده";
    el.scopeTime.textContent = "t = 0.00 s";
    drawScope();
  }

  // presets
  document.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = btn.dataset.preset;
      if (p === "slow") {
        el.kp.value = 0.8;
        el.ki.value = 0.15;
        el.kd.value = 0.12;
        el.tau.value = 2.5;
      } else if (p === "fast") {
        el.kp.value = 2.4;
        el.ki.value = 0.9;
        el.kd.value = 0.05;
        el.tau.value = 0.8;
      } else if (p === "osc") {
        el.kp.value = 4.5;
        el.ki.value = 2.2;
        el.kd.value = 0.01;
        el.tau.value = 1.2;
      }
      syncOutputs();
    });
  });

  [
    el.setpoint, el.kp, el.ki, el.kd,
    el.gain, el.tau, el.delay, el.disturb,
  ].forEach((input) => input.addEventListener("input", syncOutputs));

  [el.chSp, el.chFb, el.chU, el.chE].forEach((c) =>
    c.addEventListener("change", drawScope)
  );

  el.btnRun.addEventListener("click", () => setRunning(true));
  el.btnPause.addEventListener("click", () => setRunning(false));
  el.btnReset.addEventListener("click", resetSim);
  el.btnStep.addEventListener("click", () => {
    if (state.running) setRunning(false);
    stepOnce();
    el.mCtrlState.textContent = "گام‌به‌گام";
    el.mPlantState.textContent = "گام‌به‌گام";
  });

  // resize canvas for sharpness
  function fitCanvas() {
    const cssW = el.scope.clientWidth;
    const ratio = 1200 / 360;
    el.scope.width = Math.max(640, Math.floor(cssW * devicePixelRatio));
    el.scope.height = Math.floor(el.scope.width / ratio);
    drawScope();
  }
  window.addEventListener("resize", fitCanvas);

  syncOutputs();
  fitCanvas();
  resetSim();
})();
