/**
 * Global Gamification FX & Badge Celebration Engine
 * High-performance, zero-lag, ephemeral Canvas particle simulation with tactile graffiti stamps.
 * Works seamlessly across all pages.
 */

import { t } from "../lib/i18n.js";

export const BADGE_DEFINITIONS = [
  // ── Tier 1: Newbie (Common / Introductory) ──
  { key: "hello_world",        label: "Hello World",        icon: "gesture",         desc: "Created your account — \"You exist. That's the first step.\"", tier: "newbie", xp: 15, category: "Welcome" },
  { key: "self_discovery",     label: "Self-Discovery",     icon: "psychology",      desc: "Completed the personality quiz — \"You stared into the quiz, and the quiz stared back.\"", tier: "newbie", xp: 15, category: "Profile" },
  { key: "talk_is_silver",     label: "Talk is Silver",     icon: "comment",         desc: "Wrote your first reply — \"You said something. The internet is proud.\"", tier: "newbie", xp: 15, category: "Welcome" },
  { key: "so_it_begins",       label: "So It Begins",       icon: "rocket_launch",   desc: "Started your first discussion — \"Another thread joins the infinite void.\"", tier: "newbie", xp: 15, category: "Welcome" },

  // ── Tier 2: Activity Explorer (Uncommon / Early Progression) ──
  { key: "active_explorer",    label: "Active Explorer",    icon: "explore",         desc: "Favourited 5 activities — \"Always hunting for the next big student event.\"", tier: "explorer", xp: 25, category: "Events" },
  { key: "event_goer",         label: "Event Goer",         icon: "event_available", desc: "Participated in 1 activity — \"Made it to an event. Real world interaction unlocked!\"", tier: "explorer", xp: 25, category: "Events" },
  { key: "certified_novice",    label: "Certified Novice",    icon: "card_membership", desc: "Earned 1 certificate — \"First milestone down. The path of wisdom opens.\"", tier: "explorer", xp: 25, category: "Knowledge" },
  { key: "rising_host",        label: "Rising Host",        icon: "campaign",        desc: "Hosted your first activity — \"Welcoming students, organizing schedules.\"", tier: "explorer", xp: 25, category: "Events" },

  // ── Tier 3: Community Contributor (Rare / Active Platform Member) ──
  { key: "conversation_starter", label: "Conversation Starter", icon: "chat",       desc: "Started 5 discussions — \"You're basically a talk show host now.\"", tier: "contributor", xp: 50, category: "Community" },
  { key: "helper",               label: "Helper",                icon: "forum",      desc: "Wrote 10 replies — \"Your keyboard should be a registered charity.\"", tier: "contributor", xp: 50, category: "Community" },
  { key: "chatterbox",           label: "Chatterbox",            icon: "speaker_notes", desc: "Wrote 50 replies — \"Do you ever sleep? Do you ever stop typing?\"", tier: "contributor", xp: 50, category: "Community" },
  { key: "respected",            label: "Respected",             icon: "thumb_up",   desc: "Received 20 likes — \"People approve of your existence. Digitally, at least.\"", tier: "contributor", xp: 50, category: "Community" },
  { key: "certified_expert",    label: "Certified Expert",    icon: "workspace_premium", desc: "Earned 5 certificates — \"A certified scholar. Your knowledge base grows deeper.\"", tier: "contributor", xp: 50, category: "Knowledge" },
  { key: "grand_host",         label: "Grand Host",         icon: "co_present",      desc: "Hosted 5 activities — \"A pillar of student life. You build communities.\"", tier: "contributor", xp: 50, category: "Events" },

  // ── Tier 4: Legendary (Epic / Ultimate Platform Milestones) ──
  { key: "the_oracle",         label: "The Oracle",          icon: "auto_awesome",   desc: "Received 50 likes — \"You don't give advice. You drop prophecies.\"", tier: "legendary", xp: 100, category: "Milestone" },
  { key: "trendsetter",        label: "Trendsetter",         icon: "waves",          desc: "Started 20 discussions — \"You're not following trends. You're creating them.\"", tier: "legendary", xp: 100, category: "Milestone" },
  { key: "keyboard_warrior",   label: "Keyboard Warrior",    icon: "keyboard",       desc: "Wrote 100 replies — \"Your keyboard has seen things. Horrible, wonderful things.\"", tier: "legendary", xp: 100, category: "Milestone" },
  { key: "community_star",     label: "Community Star",      icon: "stars",          desc: "Reached 100 contribution score — \"You're basically the main character now.\"", tier: "legendary", xp: 100, category: "Milestone" },
  { key: "mentor",             label: "Mentor",              icon: "school",         desc: "Reached Level 5 — \"You have ascended. Use your power wisely.\"", tier: "legendary", xp: 100, category: "Milestone" },
  { key: "the_sage",           label: "The Sage",            icon: "emoji_objects",  desc: "Reached Level 6 — \"You are the final boss of this community.\"", tier: "legendary", xp: 100, category: "Milestone" },
  { key: "certified_master",    label: "Certified Master",    icon: "military_tech",  desc: "Earned 10 certificates — \"Ultimate scholar status. Academic brilliance unlocked!\"", tier: "legendary", xp: 100, category: "Knowledge" },
  { key: "one_man_show",       label: "One-Man Show",        icon: "theater_comedy", desc: "10x more replies than discussions started — \"Ever considered podcasting?\"", tier: "legendary", xp: 100, category: "Milestone" },
  { key: "quality_over_quantity", label: "Quality > Quantity", icon: "target",       desc: "Started ≤ 3 discussions yet each got 5+ likes — \"You barely speak, but when you do, people listen.\"", tier: "legendary", xp: 100, category: "Milestone" },
];

const TIER_COLORS = {
  newbie: {
    primary: "#1755ba",
    accent: "#38bdf8",
    bg: "#eff6ff",
    border: "#bfdbfe",
    label: "Common",
    stampText: "★ UNLOCKED ★",
    palette: ["#1755ba", "#38bdf8", "#60a5fa", "#93c5fd", "#fde047", "#ffffff"]
  },
  explorer: {
    primary: "#059669",
    accent: "#34d399",
    bg: "#ecfdf5",
    border: "#a7f3d0",
    label: "Uncommon",
    stampText: "★ EXPLORER ★",
    palette: ["#059669", "#10b981", "#34d399", "#6ee7b7", "#38bdf8", "#fde047", "#ffffff"]
  },
  contributor: {
    primary: "#7c3aed",
    accent: "#a78bfa",
    bg: "#f5f3ff",
    border: "#ddd6fe",
    label: "Rare",
    stampText: "★ PROVEN ★",
    palette: ["#7c3aed", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ec4899", "#38bdf8", "#fde047", "#ffffff"]
  },
  legendary: {
    primary: "#d97706",
    accent: "#fbbf24",
    bg: "#fffbeb",
    border: "#fde68a",
    label: "Legendary",
    stampText: "👑 LEGENDARY 👑",
    palette: ["#d97706", "#f59e0b", "#fbbf24", "#fef08a", "#ef4444", "#8b5cf6", "#10b981", "#38bdf8", "#ffffff"]
  }
};

/**
 * Plays distinct synthesized melodies with fireworks whistles, sub-bass detonations, and celestial sparkles.
 */
function playCelebrationChime(tier = "newbie") {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;

    // Helper: shaped tone
    const playTone = ({ freq, type = "sine", startTime, duration, attack = 0.015, gainVal = 0.12, decay = true }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.linearRampToValueAtTime(gainVal, startTime + attack);
      if (decay) {
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      } else {
        gain.gain.setValueAtTime(gainVal, startTime + duration - 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      }

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration + 0.05);
      return { osc, gain };
    };

    // Helper: Fireworks Launch Whoosh
    const playLaunchWhoosh = (delay = 0, targetFreq = 1200) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(120, now + delay);
      osc.frequency.exponentialRampToValueAtTime(targetFreq, now + delay + 0.16);
      g.gain.setValueAtTime(0.0001, now + delay);
      g.gain.linearRampToValueAtTime(0.06, now + delay + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.18);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.2);
    };

    // Helper: Fireworks Boom
    const playFireworkDetonation = (delay = 0.12, pitch = 130, strength = 0.25) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.type = "sine";
      osc.frequency.setValueAtTime(pitch, now + delay);
      osc.frequency.exponentialRampToValueAtTime(32, now + delay + 0.45);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(220, now + delay);
      g.gain.setValueAtTime(0.0001, now + delay);
      g.gain.linearRampToValueAtTime(strength, now + delay + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.5);
      osc.connect(filter);
      filter.connect(g);
      g.connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.55);
    };

    // Launch rocket whooshes
    playLaunchWhoosh(0, 1100);
    playFireworkDetonation(0.12, tier === "legendary" ? 140 : 110, tier === "legendary" ? 0.35 : 0.22);

    if (tier === "legendary") {
      // 👑 TIER 4: LEGENDARY — GRAND ROYAL CORONATION & MULTI-FIREWORKS FESTIVAL
      playLaunchWhoosh(0.25, 1400);
      playFireworkDetonation(0.38, 160, 0.32);
      playLaunchWhoosh(0.55, 1600);
      playFireworkDetonation(0.72, 180, 0.28);

      // Stage A (Announcement: G3 + D4 + B4)
      const stageA = [
        { freq: 196.00, type: "sawtooth", g: 0.09 },
        { freq: 293.66, type: "triangle", g: 0.13 },
        { freq: 493.88, type: "triangle", g: 0.11 }
      ];
      stageA.forEach(({ freq, type, g }) => {
        playTone({ freq, type, startTime: now, duration: 0.18, attack: 0.02, gainVal: g });
      });

      // Stage B (Ascending Triumph: A3 + E4 + C#5)
      const stageB = [
        { freq: 220.00, type: "sawtooth", g: 0.10 },
        { freq: 329.63, type: "triangle", g: 0.14 },
        { freq: 554.37, type: "triangle", g: 0.13 }
      ];
      stageB.forEach(({ freq, type, g }) => {
        playTone({ freq, type, startTime: now + 0.16, duration: 0.20, attack: 0.02, gainVal: g });
      });

      // Stage C (Glorious Royal Climax)
      const climaxVoices = [
        { freq: 130.81, type: "sawtooth", g: 0.11, dur: 2.2 },
        { freq: 196.00, type: "triangle", g: 0.13, dur: 2.2 },
        { freq: 261.63, type: "sawtooth", g: 0.14, dur: 2.3 },
        { freq: 329.63, type: "triangle", g: 0.15, dur: 2.4 },
        { freq: 392.00, type: "sawtooth", g: 0.14, dur: 2.4 },
        { freq: 523.25, type: "sine",     g: 0.16, dur: 2.6 },
        { freq: 659.25, type: "sine",     g: 0.15, dur: 2.6 },
        { freq: 1046.50, type: "sine",    g: 0.13, dur: 2.8 }
      ];
      climaxVoices.forEach(({ freq, type, g, dur }) => {
        playTone({ freq, type, startTime: now + 0.34, duration: dur, attack: 0.03, gainVal: g });
      });

      // Golden Fireworks Sparkle Cascade
      const sparkleNotes = [
        { freq: 1318.51, delay: 0.38 },
        { freq: 1567.98, delay: 0.46 },
        { freq: 1975.53, delay: 0.54 },
        { freq: 2093.00, delay: 0.62 },
        { freq: 2637.02, delay: 0.72 },
        { freq: 3135.96, delay: 0.82 },
        { freq: 4186.01, delay: 0.94 }
      ];
      sparkleNotes.forEach(({ freq, delay }) => {
        playTone({ freq, type: "sine", startTime: now + delay, duration: 0.75, attack: 0.005, gainVal: 0.09 });
      });

    } else if (tier === "contributor") {
      // 🔮 TIER 3: CONTRIBUTOR — HEROIC SYNTH FANFARE WITH DUAL DETONATIONS
      playLaunchWhoosh(0.28, 1350);
      playFireworkDetonation(0.42, 140, 0.26);

      // Bass Pulse
      playTone({ freq: 130.81, type: "triangle", startTime: now, duration: 0.3, attack: 0.02, gainVal: 0.18 });
      playTone({ freq: 174.61, type: "triangle", startTime: now + 0.28, duration: 0.9, attack: 0.02, gainVal: 0.20 });

      // Ascending Arpeggio
      const fanfareSteps = [
        { freq: 349.23, delay: 0.00, dur: 0.22, g: 0.13 },
        { freq: 440.00, delay: 0.08, dur: 0.22, g: 0.14 },
        { freq: 523.25, delay: 0.16, dur: 0.24, g: 0.15 },
        { freq: 698.46, delay: 0.24, dur: 0.26, g: 0.17 },
      ];
      fanfareSteps.forEach(({ freq, delay, dur, g }) => {
        playTone({ freq, type: "triangle", startTime: now + delay, duration: dur, attack: 0.015, gainVal: g });
        playTone({ freq: freq * 2, type: "sine", startTime: now + delay, duration: dur * 0.7, attack: 0.01, gainVal: g * 0.4 });
      });

      // Power Chord Arrival
      const powerChord = [
        { freq: 349.23, type: "sawtooth", g: 0.09 },
        { freq: 698.46, type: "triangle", g: 0.16 },
        { freq: 880.00, type: "sine",     g: 0.15 },
        { freq: 1046.50, type: "sine",    g: 0.14 }
      ];
      powerChord.forEach(({ freq, type, g }) => {
        playTone({ freq, type, startTime: now + 0.32, duration: 1.3, attack: 0.025, gainVal: g });
      });

      // Sparkles
      const sparkles = [1396.91, 1760.00, 2093.00, 2793.83];
      sparkles.forEach((freq, i) => {
        playTone({ freq, type: "sine", startTime: now + 0.42 + i * 0.09, duration: 0.55, attack: 0.005, gainVal: 0.07 });
      });

    } else if (tier === "explorer") {
      // 🌿 TIER 2: EXPLORER — CHEERFUL MARIMBA CHIME & CRYSTAL HARMONICS
      playLaunchWhoosh(0.18, 1200);
      playFireworkDetonation(0.32, 120, 0.18);

      const melody = [
        { freq: 440.00, delay: 0.00, dur: 0.35, g: 0.13 },
        { freq: 554.37, delay: 0.09, dur: 0.38, g: 0.14 },
        { freq: 659.25, delay: 0.18, dur: 0.42, g: 0.15 },
        { freq: 880.00, delay: 0.27, dur: 0.75, g: 0.18 },
      ];
      melody.forEach(({ freq, delay, dur, g }) => {
        playTone({ freq, type: "sine", startTime: now + delay, duration: dur, attack: 0.01, gainVal: g });
        playTone({ freq: freq * 2.756, type: "sine", startTime: now + delay, duration: dur * 0.45, attack: 0.005, gainVal: g * 0.35 });
      });
      playTone({ freq: 1318.51, type: "sine", startTime: now + 0.38, duration: 0.5, attack: 0.005, gainVal: 0.08 });
      playTone({ freq: 1760.00, type: "sine", startTime: now + 0.48, duration: 0.6, attack: 0.005, gainVal: 0.07 });

    } else {
      // 🔹 TIER 1: NEWBIE — CRISP, FRIENDLY DOUBLE-PING POP
      playTone({ freq: 783.99, type: "sine", startTime: now, duration: 0.18, attack: 0.008, gainVal: 0.12 });
      playTone({ freq: 1567.98, type: "triangle", startTime: now, duration: 0.10, attack: 0.005, gainVal: 0.04 });

      playTone({ freq: 1046.50, type: "sine", startTime: now + 0.09, duration: 0.32, attack: 0.008, gainVal: 0.14 });
      playTone({ freq: 2093.00, type: "triangle", startTime: now + 0.09, duration: 0.18, attack: 0.005, gainVal: 0.05 });
      playTone({ freq: 2637.02, type: "sine", startTime: now + 0.18, duration: 0.45, attack: 0.005, gainVal: 0.07 });
    }

    setTimeout(() => {
      if (ctx.state !== "closed") ctx.close();
    }, 3500);
  } catch (e) {}
}

/**
 * Helper to draw a 5-pointed star on canvas
 */
function drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
  let rot = (Math.PI / 2) * 3;
  let x = cx;
  let y = cy;
  let step = Math.PI / spikes;

  ctx.beginPath();
  ctx.moveTo(cx, cy - outerRadius);
  for (let i = 0; i < spikes; i++) {
    x = cx + Math.cos(rot) * outerRadius;
    y = cy + Math.sin(rot) * outerRadius;
    ctx.lineTo(x, y);
    rot += step;

    x = cx + Math.cos(rot) * innerRadius;
    y = cy + Math.sin(rot) * innerRadius;
    ctx.lineTo(x, y);
    rot += step;
  }
  ctx.lineTo(cx, cy - outerRadius);
  ctx.closePath();
  ctx.fill();
}

/**
 * Helper to draw a diamond on canvas
 */
function drawDiamond(ctx, cx, cy, size) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - size);
  ctx.lineTo(cx + size * 0.7, cy);
  ctx.lineTo(cx, cy + size);
  ctx.lineTo(cx - size * 0.7, cy);
  ctx.closePath();
  ctx.fill();
}

/**
 * Multi-Rocket High-Performance Fireworks & Confetti Cannon Physics Simulator
 */
export function launchConfettiBurst(tier = "newbie") {
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) return;

  const canvas = document.createElement("canvas");
  canvas.className = "sw-confetti-canvas";
  canvas.style.cssText = "position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 100000; overflow: hidden;";
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  const palette = (TIER_COLORS[tier] || TIER_COLORS.newbie).palette;
  const particles = [];
  const shockwaves = [];
  const rockets = [];
  const timedSpawns = [];

  let DURATION_MS = 2800;
  if (tier === "legendary") DURATION_MS = 4800;
  else if (tier === "contributor") DURATION_MS = 3800;
  else if (tier === "explorer") DURATION_MS = 3200;

  function createExplosion(x, y, count, colorPalette, sparkType = "mixed", speedScale = 1.0) {
    shockwaves.push({
      x, y,
      radius: 4,
      maxRadius: tier === "legendary" ? 290 : (tier === "contributor" ? 230 : 170),
      color: colorPalette[0] || "#fbbf24",
      lineWidth: tier === "legendary" ? 5 : 3.5,
      alpha: 0.95
    });

    if (tier === "legendary" || tier === "contributor") {
      shockwaves.push({
        x, y,
        radius: 2,
        maxRadius: tier === "legendary" ? 210 : 150,
        color: "#ffffff",
        lineWidth: 2.5,
        alpha: 1
      });
    }

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (Math.random() * 12 + 5) * speedScale;
      const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];

      let shape = "circle";
      const rand = Math.random();
      if (sparkType === "willow") {
        shape = "willow";
      } else if (tier === "legendary") {
        shape = rand > 0.4 ? "star" : (rand > 0.2 ? "willow" : (rand > 0.08 ? "diamond" : "ribbon"));
      } else if (tier === "contributor") {
        shape = rand > 0.45 ? "star" : (rand > 0.25 ? "willow" : (rand > 0.1 ? "diamond" : "ribbon"));
      } else if (tier === "explorer") {
        shape = rand > 0.4 ? "diamond" : (rand > 0.2 ? "ribbon" : "circle");
      } else {
        shape = rand > 0.45 ? "circle" : (rand > 0.2 ? "ribbon" : "star");
      }

      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (shape === "willow" ? 1.6 : (tier === "legendary" ? 3.8 : 2.2)),
        size: (Math.random() * 7.5 + 4) * (tier === "legendary" ? 1.35 : 1),
        color,
        shape,
        history: (shape === "willow" || tier === "legendary") ? [] : null,
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 16,
        rotX: Math.random() * Math.PI,
        rotXSpeed: Math.random() * 0.16 + 0.04,
        rotY: Math.random() * Math.PI,
        rotYSpeed: Math.random() * 0.16 + 0.04,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: Math.random() * 0.2 + 0.1,
        swayPhase: Math.random() * Math.PI * 2,
        gravity: shape === "willow" ? 0.14 : (tier === "legendary" ? 0.16 : 0.22),
        drag: shape === "willow" ? 0.982 : (tier === "legendary" ? 0.976 : 0.965),
        alpha: 1,
        bornTime: performance.now(),
        lifeSpan: shape === "willow" ? 2400 : 1700
      });
    }
  }

  // Corner Cannon Confetti Blast
  function fireConfettiCannon(originX, originY, baseAngle, spreadAngle, count, colorPalette, power = 1.0) {
    for (let i = 0; i < count; i++) {
      const angle = baseAngle + (Math.random() - 0.5) * spreadAngle;
      const speed = (Math.random() * 16 + 12) * power;
      const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];

      const rand = Math.random();
      const shape = rand > 0.4 ? "streamer" : (rand > 0.2 ? "ribbon" : (rand > 0.08 ? "foil_star" : "diamond"));

      particles.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: (Math.random() * 9 + 5) * (tier === "legendary" ? 1.3 : 1),
        color,
        shape,
        history: null,
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 22,
        rotX: Math.random() * Math.PI,
        rotXSpeed: Math.random() * 0.25 + 0.06,
        rotY: Math.random() * Math.PI,
        rotYSpeed: Math.random() * 0.25 + 0.06,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: Math.random() * 0.25 + 0.1,
        swayPhase: Math.random() * Math.PI * 2,
        gravity: 0.18 + Math.random() * 0.08,
        drag: 0.968,
        alpha: 1,
        bornTime: performance.now(),
        lifeSpan: 3200
      });
    }
  }

  // Top Gentle Confetti Rain
  function spawnConfettiRain(count, colorPalette) {
    for (let i = 0; i < count; i++) {
      const rx = Math.random() * width;
      const ry = -Math.random() * 80 - 10;
      const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
      const rand = Math.random();
      const shape = rand > 0.45 ? "ribbon" : (rand > 0.2 ? "streamer" : (rand > 0.08 ? "foil_star" : "diamond"));

      particles.push({
        x: rx,
        y: ry,
        vx: (Math.random() - 0.5) * 2.5,
        vy: Math.random() * 2.5 + 1.2,
        size: (Math.random() * 8 + 4.5) * (tier === "legendary" ? 1.25 : 1),
        color,
        shape,
        history: null,
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 14,
        rotX: Math.random() * Math.PI,
        rotXSpeed: Math.random() * 0.15 + 0.05,
        rotY: Math.random() * Math.PI,
        rotYSpeed: Math.random() * 0.15 + 0.05,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: Math.random() * 0.2 + 0.1,
        swayPhase: Math.random() * Math.PI * 2,
        gravity: 0.06 + Math.random() * 0.04,
        drag: 0.985,
        alpha: 1,
        bornTime: performance.now(),
        lifeSpan: 4000
      });
    }
  }

  function launchRocket(startX, startY, targetX, targetY, delay = 0, count = 65, colors = palette, type = "mixed", speedScale = 1.0) {
    rockets.push({
      x: startX,
      y: startY,
      targetX,
      targetY,
      delay,
      exploded: false,
      speed: (startY - targetY) / 18,
      color: colors[0] || "#f59e0b",
      colors,
      count,
      type,
      speedScale
    });
  }

  const cx = width / 2;
  const cy = height / 2 - 30;

  // ════════════════════════════════════════════════════════════════
  // TIER-SPECIFIC FIREWORKS & CONFETTI BOMBARDMENT
  // ════════════════════════════════════════════════════════════════

  // Primary Center & Flanking Fireworks
  launchRocket(cx, height + 20, cx, cy, 0, tier === "legendary" ? 130 : (tier === "contributor" ? 95 : 60), palette, "mixed", 1.2);
  launchRocket(cx - width * 0.24, height + 20, cx - width * 0.22, cy - 40, 200, tier === "legendary" ? 90 : 55, palette, "willow", 1.1);
  launchRocket(cx + width * 0.24, height + 20, cx + width * 0.22, cy - 40, 380, tier === "legendary" ? 90 : 55, palette, "willow", 1.1);

  // 1. DUAL CORNER CONFETTI CANNONS FOR HIGHER RANKS
  if (tier === "legendary") {
    // Initial high-velocity confetti cannon blast
    fireConfettiCannon(0, height + 10, -Math.PI / 4, Math.PI / 6, 85, palette, 1.25);
    fireConfettiCannon(width, height + 10, -3 * Math.PI / 4, Math.PI / 6, 85, palette, 1.25);

    // Follow-up cannon waves
    timedSpawns.push({ delay: 350, fn: () => {
      fireConfettiCannon(0, height + 10, -Math.PI / 3.5, Math.PI / 5, 75, palette, 1.15);
      fireConfettiCannon(width, height + 10, -2.4 * Math.PI / 3.5, Math.PI / 5, 75, palette, 1.15);
    }});
    timedSpawns.push({ delay: 750, fn: () => {
      fireConfettiCannon(0, height + 10, -Math.PI / 4, Math.PI / 5, 80, palette, 1.3);
      fireConfettiCannon(width, height + 10, -3 * Math.PI / 4, Math.PI / 5, 80, palette, 1.3);
      spawnConfettiRain(90, palette);
    }});
    timedSpawns.push({ delay: 1200, fn: () => {
      fireConfettiCannon(width * 0.2, height + 10, -Math.PI / 2.3, Math.PI / 4, 70, palette, 1.1);
      fireConfettiCannon(width * 0.8, height + 10, -Math.PI / 1.75, Math.PI / 4, 70, palette, 1.1);
      spawnConfettiRain(100, palette);
    }});

    // Extra aerial fireworks volleys
    launchRocket(cx - width * 0.36, height + 20, cx - width * 0.32, cy - 90, 600, 100, palette, "star", 1.25);
    launchRocket(cx + width * 0.36, height + 20, cx + width * 0.32, cy - 90, 800, 100, palette, "star", 1.25);
    launchRocket(cx, height + 20, cx, cy - 140, 1100, 150, palette, "willow", 1.4);
    launchRocket(cx - width * 0.18, height + 20, cx - width * 0.15, cy + 40, 1450, 85, palette, "mixed", 1.15);
    launchRocket(cx + width * 0.18, height + 20, cx + width * 0.15, cy + 40, 1650, 85, palette, "mixed", 1.15);

  } else if (tier === "contributor") {
    // Contributor dual corner confetti cannons
    fireConfettiCannon(0, height + 10, -Math.PI / 4, Math.PI / 6, 60, palette, 1.15);
    fireConfettiCannon(width, height + 10, -3 * Math.PI / 4, Math.PI / 6, 60, palette, 1.15);

    timedSpawns.push({ delay: 450, fn: () => {
      fireConfettiCannon(0, height + 10, -Math.PI / 3.6, Math.PI / 5, 55, palette, 1.1);
      fireConfettiCannon(width, height + 10, -2.4 * Math.PI / 3.6, Math.PI / 5, 55, palette, 1.1);
      spawnConfettiRain(60, palette);
    }});
    timedSpawns.push({ delay: 900, fn: () => {
      spawnConfettiRain(70, palette);
    }});

    launchRocket(cx - width * 0.35, height + 20, cx - width * 0.32, cy - 90, 620, 85, palette, "star", 1.2);
    launchRocket(cx + width * 0.35, height + 20, cx + width * 0.32, cy - 90, 820, 85, palette, "star", 1.2);

  } else if (tier === "explorer") {
    fireConfettiCannon(0, height + 10, -Math.PI / 4, Math.PI / 6, 35, palette, 1.0);
    fireConfettiCannon(width, height + 10, -3 * Math.PI / 4, Math.PI / 6, 35, palette, 1.0);
    timedSpawns.push({ delay: 350, fn: () => {
      spawnConfettiRain(40, palette);
    }});
  } else {
    // Newbie celebration burst
    fireConfettiCannon(width * 0.3, height + 10, -Math.PI / 2.5, Math.PI / 5, 25, palette, 0.9);
    fireConfettiCannon(width * 0.7, height + 10, -Math.PI / 1.7, Math.PI / 5, 25, palette, 0.9);
  }

  let animationFrameId;
  const startTime = performance.now();

  function render(time) {
    const elapsed = time - startTime;
    ctx.clearRect(0, 0, width, height);

    // Trigger timed spawns (confetti waves)
    for (let i = timedSpawns.length - 1; i >= 0; i--) {
      if (elapsed >= timedSpawns[i].delay) {
        timedSpawns[i].fn();
        timedSpawns.splice(i, 1);
      }
    }

    // Update & Render Rockets
    for (let r of rockets) {
      if (elapsed >= r.delay && !r.exploded) {
        r.y -= r.speed;
        r.x += (r.targetX - r.x) * 0.08;

        // Spark trail behind rocket
        if (Math.random() > 0.12) {
          particles.push({
            x: r.x + (Math.random() - 0.5) * 4,
            y: r.y + (Math.random() * 8 + 4),
            vx: (Math.random() - 0.5) * 2,
            vy: Math.random() * 2 + 1,
            size: Math.random() * 3 + 2,
            color: r.color,
            shape: "circle",
            history: null,
            rotation: 0,
            rotSpeed: 0,
            rotX: 0, rotXSpeed: 0, rotY: 0, rotYSpeed: 0,
            twinklePhase: 0, twinkleSpeed: 0,
            swayPhase: 0,
            gravity: 0.1,
            drag: 0.96,
            alpha: 0.85,
            bornTime: time,
            lifeSpan: 800
          });
        }

        // Draw ascending rocket head
        ctx.save();
        ctx.beginPath();
        ctx.arc(r.x, r.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = r.color;
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.restore();

        // Check apex detonation
        if (r.y <= r.targetY) {
          r.exploded = true;
          createExplosion(r.x, r.y, r.count, r.colors, r.type, r.speedScale);
        }
      }
    }

    // Update & Render Expanding Shockwaves
    for (let sw of shockwaves) {
      if (sw.alpha > 0.01) {
        sw.radius += (sw.maxRadius - sw.radius) * 0.13;
        sw.alpha *= 0.90;
        ctx.save();
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
        ctx.strokeStyle = sw.color;
        ctx.lineWidth = sw.lineWidth;
        ctx.globalAlpha = sw.alpha;
        ctx.shadowColor = sw.color;
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.restore();
      }
    }

    let aliveCount = 0;

    // Update & Render Sparks & Confetti
    for (let p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= p.drag;
      p.vy = p.vy * p.drag + p.gravity;

      // Sinusoidal air drift for fluttering confetti
      if (p.shape === "ribbon" || p.shape === "streamer") {
        p.vx += Math.sin(time * 0.003 + p.swayPhase) * 0.12;
      }

      p.rotation += p.rotSpeed;
      p.rotX += p.rotXSpeed;
      p.rotY += p.rotYSpeed;
      p.twinklePhase += p.twinkleSpeed;

      const pAge = time - p.bornTime;
      const baseAlpha = Math.max(0, 1 - (pAge / (p.lifeSpan || 2000)));
      let currentAlpha = baseAlpha;
      if (p.shape === "star" || p.shape === "diamond" || p.shape === "foil_star") {
        currentAlpha = baseAlpha * (0.6 + 0.4 * Math.sin(p.twinklePhase));
      }
      p.alpha = currentAlpha;

      if (p.history) {
        p.history.push({ x: p.x, y: p.y });
        if (p.history.length > 5) p.history.shift();
      }

      if (p.alpha > 0.01) {
        aliveCount++;
        ctx.save();
        ctx.globalAlpha = p.alpha;

        // Draw spark tail if available
        if (p.history && p.history.length > 1) {
          ctx.beginPath();
          ctx.moveTo(p.history[0].x, p.history[0].y);
          for (let k = 1; k < p.history.length; k++) {
            ctx.lineTo(p.history[k].x, p.history[k].y);
          }
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size * 0.6;
          ctx.lineCap = "round";
          ctx.stroke();
        }

        ctx.fillStyle = p.color;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);

        // 3D perspective flip scaling
        const scaleX = Math.cos(p.rotX);
        const scaleY = Math.sin(p.rotY);
        ctx.scale(Math.abs(scaleX) < 0.1 ? 0.1 : scaleX, Math.abs(scaleY) < 0.1 ? 0.1 : scaleY);

        if (p.shape === "star" || p.shape === "foil_star") {
          drawStar(ctx, 0, 0, 5, p.size, p.size / 2.2);
        } else if (p.shape === "diamond") {
          drawDiamond(ctx, 0, 0, p.size);
        } else if (p.shape === "streamer") {
          ctx.fillRect(-p.size * 1.3, -p.size * 0.25, p.size * 2.6, p.size * 0.5);
        } else if (p.shape === "ribbon") {
          ctx.fillRect(-p.size * 0.8, -p.size * 0.35, p.size * 1.6, p.size * 0.7);
        } else if (p.shape === "rect") {
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.65);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    if (elapsed < DURATION_MS && (aliveCount > 0 || rockets.some(r => !r.exploded) || timedSpawns.length > 0)) {
      animationFrameId = requestAnimationFrame(render);
    } else {
      cancelAnimationFrame(animationFrameId);
      if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
    }
  }

  animationFrameId = requestAnimationFrame(render);
}

/**
 * Display the Achievement Showcase Modal with Graffiti Stamp and Multi-Stage Fireworks
 */
export function triggerBadgeCelebration(badgeKeyOrObj, options = {}) {
  let badge = badgeKeyOrObj;
  if (typeof badgeKeyOrObj === "string") {
    badge = BADGE_DEFINITIONS.find(b => b.key === badgeKeyOrObj);
  }
  if (!badge) return;

  // Remove any existing celebration modal & canvas
  const existing = document.getElementById("badge-celebration-modal");
  if (existing) existing.remove();

  const existingCanvas = document.querySelector(".sw-confetti-canvas");
  if (existingCanvas) existingCanvas.remove();

  const tierMeta = TIER_COLORS[badge.tier] || TIER_COLORS.newbie;
  const isInspect = options.isInspect || false;
  const isProfilePage = window.location.pathname.includes("profile.html") || 
                        window.location.pathname.endsWith("/profile") || 
                        document.getElementById("badges-section") !== null;

  // Tier-specific dynamic aura, godrays and orbiting star crystals
  let extraDecorativeHTML = `
    <div class="badge-radial-flash" aria-hidden="true"></div>
  `;

  if (badge.tier === "legendary") {
    extraDecorativeHTML += `
      <div class="badge-godrays" aria-hidden="true"></div>
      <div class="badge-crown-crest" aria-hidden="true">👑</div>
      <div class="badge-orbit-sparkle s1" aria-hidden="true">✦</div>
      <div class="badge-orbit-sparkle s2" aria-hidden="true">★</div>
      <div class="badge-orbit-sparkle s3" aria-hidden="true">✦</div>
      <div class="badge-orbit-sparkle s4" aria-hidden="true">✨</div>
      <div class="badge-orbit-sparkle s5" aria-hidden="true">★</div>
      <div class="badge-orbit-sparkle s6" aria-hidden="true">✦</div>
    `;
  } else if (badge.tier === "contributor") {
    extraDecorativeHTML += `
      <div class="badge-rotating-aura" aria-hidden="true"></div>
      <div class="badge-orbit-sparkle s1" aria-hidden="true">✦</div>
      <div class="badge-orbit-sparkle s2" aria-hidden="true">★</div>
      <div class="badge-orbit-sparkle s3" aria-hidden="true">✦</div>
      <div class="badge-orbit-sparkle s4" aria-hidden="true">✨</div>
    `;
  } else if (badge.tier === "explorer") {
    extraDecorativeHTML += `
      <div class="badge-glow-ring" aria-hidden="true"></div>
      <div class="badge-orbit-sparkle s1" aria-hidden="true">✦</div>
      <div class="badge-orbit-sparkle s2" aria-hidden="true">★</div>
    `;
  } else {
    extraDecorativeHTML += `
      <div class="badge-newbie-pulse" aria-hidden="true"></div>
      <div class="badge-orbit-sparkle s1" aria-hidden="true">✦</div>
    `;
  }

  const tierLabel = t("badges.rarity." + badge.tier, tierMeta.label);
  const badgeWord = t("badges.badge_word", "Badge");
  const stampText = t("badges.stamps." + badge.tier, tierMeta.stampText);
  const badgeTitle = t("badges.list." + badge.key + ".label", badge.label);
  const badgeDesc = t("badges.list." + badge.key + ".desc", badge.desc);
  const catKey = (badge.category || "Community").toLowerCase();
  const catLabel = t("badges.categories." + catKey, badge.category || "Community");
  const catHeading = t("badges.category_label", "Category:");
  const statusHeading = t("badges.status_label", "Status:");
  const statusValue = isInspect ? t("badges.status_unlocked", "Unlocked in Profile") : t("badges.status_new", "Newly Achieved!");
  const replayBtnText = t("badges.celebration.replay_btn", "Replay FX");
  const viewProfileBtnText = t("badges.celebration.view_profile_btn", "View in Profile");
  const closeAria = t("badges.celebration.close_btn", "Close modal");

  const modalOverlay = document.createElement("div");
  modalOverlay.id = "badge-celebration-modal";
  modalOverlay.className = "badge-modal-overlay active";
  modalOverlay.setAttribute("role", "dialog");
  modalOverlay.setAttribute("aria-modal", "true");

  modalOverlay.innerHTML = `
    <div class="badge-modal-backdrop"></div>
    <div class="badge-modal-card tier-${badge.tier}">
      <button class="badge-modal-close" aria-label="${closeAria}">
        <span class="material-symbols-outlined text-lg">close</span>
      </button>

      <div class="badge-modal-top">
        <div class="badge-modal-pills-group">
          <span class="badge-modal-tier-pill" style="background: ${tierMeta.bg}; color: ${tierMeta.primary}; border: 1px solid ${tierMeta.border};">
            <span class="material-symbols-outlined text-xs">military_tech</span> ${tierLabel} ${badgeWord}
          </span>
          <span class="badge-modal-xp-pill" style="background: #f8fafc; border: 1px solid #e2e8f0; color: #0f172a;">
            +${badge.xp || 25} XP
          </span>
        </div>
      </div>

      <!-- 3D Emblem Container -->
      <div class="badge-modal-emblem-wrap tier-${badge.tier}">
        ${extraDecorativeHTML}
        <div class="badge-modal-emblem tier-${badge.tier}">
          <div class="badge-emblem-sheen"></div>
          <span class="material-symbols-outlined badge-modal-icon">${badge.icon}</span>
        </div>
        <!-- Tactile Graffiti Stamp -->
        <div class="badge-graffiti-stamp tier-${badge.tier}">
          <span>${stampText}</span>
        </div>
      </div>

      <div class="badge-modal-content">
        <h3 class="badge-modal-title tier-${badge.tier}">${badgeTitle}</h3>
        <p class="badge-modal-desc">${badgeDesc}</p>
        <div class="badge-modal-meta-row">
          <span><strong>${catHeading}</strong> ${catLabel}</span>
          <span>●</span>
          <span><strong>${statusHeading}</strong> ${statusValue}</span>
        </div>
      </div>

      <div class="badge-modal-actions">
        <button type="button" class="badge-modal-btn replay-btn" id="badge-replay-fx-btn">
          <span class="material-symbols-outlined text-sm">celebration</span>
          <span>${replayBtnText}</span>
        </button>
        ${!isProfilePage ? `
        <a href="/profile.html#badge-${badge.key}" class="badge-modal-btn primary-btn tier-${badge.tier}" id="badge-view-profile-btn">
          <span>${viewProfileBtnText}</span>
          <span class="material-symbols-outlined text-sm">arrow_forward</span>
        </a>
        ` : ""}
      </div>
    </div>
  `;

  document.body.appendChild(modalOverlay);

  // Play synthesized fireworks audio & launch fireworks show
  playCelebrationChime(badge.tier);
  launchConfettiBurst(badge.tier);

  // Event handlers
  const closeBtn = modalOverlay.querySelector(".badge-modal-close");
  const backdrop = modalOverlay.querySelector(".badge-modal-backdrop");
  const replayBtn = modalOverlay.querySelector("#badge-replay-fx-btn");

  const closeModal = () => {
    modalOverlay.classList.remove("active");
    setTimeout(() => modalOverlay.remove(), 250);
  };

  closeBtn?.addEventListener("click", closeModal);
  backdrop?.addEventListener("click", closeModal);

  // Replay FX triggers the exact identical shaking intro sequence
  replayBtn?.addEventListener("click", () => {
    triggerBadgeCelebration(badge, { isInspect });
  });

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      closeModal();
      document.removeEventListener("keydown", handleKeyDown);
    }
  };
  document.addEventListener("keydown", handleKeyDown);
}

/**
 * Queue a badge for celebration on the next page (Cross-page queue)
 */
export function queueBadgeCelebration(badgeKeyOrObj) {
  try {
    const key = typeof badgeKeyOrObj === "string" ? badgeKeyOrObj : badgeKeyOrObj.key;
    const currentQueue = JSON.parse(sessionStorage.getItem("pending_badge_celebrations") || "[]");
    if (!currentQueue.includes(key)) {
      currentQueue.push(key);
      sessionStorage.setItem("pending_badge_celebrations", JSON.stringify(currentQueue));
    }
  } catch (e) {}
}

/**
 * Check if there are any queued badges on page load and trigger them
 */
export function checkPendingBadgeCelebrations() {
  try {
    const raw = sessionStorage.getItem("pending_badge_celebrations");
    if (!raw) return;
    const queue = JSON.parse(raw);
    if (Array.isArray(queue) && queue.length > 0) {
      const nextBadge = queue.shift();
      sessionStorage.setItem("pending_badge_celebrations", JSON.stringify(queue));
      setTimeout(() => {
        triggerBadgeCelebration(nextBadge);
      }, 700);
    }
  } catch (e) {}
}

/**
 * Global Initialization: Listens for events and checks queues
 */
export function initBadgeCelebration() {
  checkPendingBadgeCelebrations();

  // Listen for custom badge unlocked event globally
  window.addEventListener("badge-unlocked", (e) => {
    const badge = e.detail?.badge || e.detail?.key;
    if (badge) {
      triggerBadgeCelebration(badge, { isInspect: false });
    }
  });

  // Expose globally for instant testing or inline triggers
  window.triggerBadgeCelebration = triggerBadgeCelebration;
  window.queueBadgeCelebration = queueBadgeCelebration;
}

