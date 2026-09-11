import { useRef, useEffect, useState, useCallback } from "react";
import "./App.css"

// ---------- Level data ----------
const CANVAS_W = 800;
const CANVAS_H = 450;
const GROUND_Y = 380;
const LEVEL_WIDTH = 6000;
const FLAG_X = 5850;

const GRAVITY = 0.55;
const JUMP_VELOCITY = -11.5;
const MOVE_SPEED = 4.2;
const FRICTION = 0.82;
const MAX_FALL = 14;
const PLAYER_W = 32;
const PLAYER_H = 40;

const ZONES = [
  { name: "Animal Land", start: 0, end: 2100, sky: ["#8FD3E8", "#C9F0D8"], ground: "#6FA85B" },
  { name: "Color Land", start: 2100, end: 3900, sky: ["#F4C9E8", "#FDE6C9"], ground: "#C97BB0" },
  { name: "Number Land", start: 3900, end: LEVEL_WIDTH, sky: ["#C9D6F4", "#E8DBF9"], ground: "#6B7FD1" },
];

const zoneAt = (x) => ZONES.find((z) => x >= z.start && x < z.end) || ZONES[ZONES.length - 1];

const PITS = [
  { start: 1050, end: 1150 },
  { start: 3150, end: 3260 },
];

const PLATFORMS = [
  { x: 500, y: 300, w: 120, h: 20 },
  { x: 800, y: 260, w: 100, h: 20 },
  { x: 1400, y: 300, w: 140, h: 20 },
  { x: 1700, y: 250, w: 100, h: 20 },
  { x: 2400, y: 300, w: 120, h: 20 },
  { x: 2700, y: 260, w: 100, h: 20 },
  { x: 3000, y: 300, w: 100, h: 20 },
  { x: 3500, y: 280, w: 120, h: 20 },
  { x: 4300, y: 300, w: 120, h: 20 },
  { x: 4600, y: 260, w: 100, h: 20 },
  { x: 5000, y: 300, w: 140, h: 20 },
  { x: 5300, y: 260, w: 100, h: 20 },
];

const mkCoin = (x, y, emoji, word) => ({ x, y, emoji, word, collected: false });

const COINS = [
  mkCoin(350, 350, "🐱", "Cat"),
  mkCoin(550, 285, "🐶", "Dog"),
  mkCoin(850, 245, "🐘", "Elephant"),
  mkCoin(1450, 285, "🐸", "Frog"),
  mkCoin(2200, 350, "🔴", "Red"),
  mkCoin(2450, 285, "🔵", "Blue"),
  mkCoin(2750, 245, "🟡", "Yellow"),
  mkCoin(3550, 265, "🟢", "Green"),
  mkCoin(4000, 350, "1️⃣", "One"),
  mkCoin(4350, 285, "2️⃣", "Two"),
  mkCoin(4650, 245, "3️⃣", "Three"),
  mkCoin(5050, 285, "4️⃣", "Four"),
  mkCoin(5350, 245, "5️⃣", "Five"),
];

const mkEnemy = (x, minX, maxX, word) => ({
  x, minX, maxX, y: 350, dir: 1, alive: true, word, w: 30, h: 30,
});

const ENEMIES = [
  mkEnemy(750, 700, 950, "Blue"),
  mkEnemy(1750, 1650, 1950, "Five"),
  mkEnemy(2600, 2500, 2800, "Dog"),
  mkEnemy(3300, 3260, 3560, "Two"),
  mkEnemy(4450, 4380, 4650, "Red"),
  mkEnemy(5150, 5050, 5350, "Cat"),
];

const mkTrap = (x, y, emoji, word) => ({ x, y, emoji, word, trap: true, collected: false });

// Trap coins: the picture and the word underneath deliberately DON'T match.
// Grabbing one costs a heart, so players have to actually read before they jump for it.
const TRAPS = [
  mkTrap(480, 350, "🐶", "Cat"),
  mkTrap(1000, 350, "🐱", "Frog"),
  mkTrap(1550, 285, "🐘", "Dog"),
  mkTrap(2350, 350, "🔵", "Red"),
  mkTrap(2850, 245, "🟡", "Green"),
  mkTrap(3650, 265, "🟢", "Yellow"),
  mkTrap(4200, 350, "2️⃣", "One"),
  mkTrap(4750, 245, "3️⃣", "Four"),
  mkTrap(5200, 285, "4️⃣", "Five"),
];

const ALL_WORDS = COINS.map((c) => ({ word: c.word, emoji: c.emoji }));

const zoneWords = (zoneIdx) => {
  const z = ZONES[zoneIdx];
  return COINS.filter((c) => c.x >= z.start && c.x < z.end);
};

function buildQuiz(zoneIdx) {
  const pool = zoneWords(zoneIdx);
  const correct = pool[Math.floor(Math.random() * pool.length)];
  const distractorPool = ALL_WORDS.filter((w) => w.word !== correct.word);
  const shuffledPool = [...distractorPool].sort(() => Math.random() - 0.5);
  const distractors = shuffledPool.slice(0, 2);
  const options = [correct, ...distractors].sort(() => Math.random() - 0.5);
  return {
    emoji: correct.emoji,
    correctWord: correct.word,
    options: options.map((o) => o.word),
  };
}

const GATES_DEF = [2100, 3900, 5700];

export default function WordJumpKingdom() {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const lastTimeRef = useRef(0);
  const keysRef = useRef({ left: false, right: false, jump: false });
  const toastTimerRef = useRef(null);

  const playerRef = useRef({ x: 50, y: 300, vx: 0, vy: 0, onGround: false, facing: 1, anim: 0, invuln: 0 });
  const cameraRef = useRef(0);
  const coinsRef = useRef([]);
  const enemiesRef = useRef([]);
  const gatesRef = useRef([]);
  const scoreRef = useRef(0);
  const livesRef = useRef(3);
  const checkpointRef = useRef(50);
  const statusRef = useRef("start"); // start | playing | quiz | won | lost
  const currentZoneRef = useRef(0);

  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [status, setStatus] = useState("start");
  const [zoneName, setZoneName] = useState(ZONES[0].name);
  const [wordsLearned, setWordsLearned] = useState([]);
  const [toast, setToast] = useState("");
  const [quiz, setQuiz] = useState(null);
  const [quizFeedback, setQuizFeedback] = useState("");
  const [pendingGate, setPendingGate] = useState(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(""), 1700);
  }, []);

  const resetGame = useCallback(() => {
    playerRef.current = { x: 50, y: 300, vx: 0, vy: 0, onGround: false, facing: 1, anim: 0, invuln: 0 };
    cameraRef.current = 0;
    coinsRef.current = [
      ...COINS.map((c) => ({ ...c, trap: false, collected: false })),
      ...TRAPS.map((t) => ({ ...t, collected: false })),
    ];
    enemiesRef.current = ENEMIES.map((e) => ({ ...e, alive: true, x: e.x, dir: 1 }));
    gatesRef.current = GATES_DEF.map((x, i) => ({ x, zoneIdx: i, open: false }));
    scoreRef.current = 0;
    livesRef.current = 3;
    checkpointRef.current = 50;
    currentZoneRef.current = 0;
    setScore(0);
    setLives(3);
    setZoneName(ZONES[0].name);
    setWordsLearned([]);
    setQuiz(null);
    setQuizFeedback("");
    setPendingGate(null);
    statusRef.current = "playing";
    setStatus("playing");
  }, []);

  const loseLife = useCallback((teleport) => {
    livesRef.current -= 1;
    setLives(livesRef.current);
    if (livesRef.current <= 0) {
      statusRef.current = "lost";
      setStatus("lost");
      return;
    }
    if (teleport) {
      playerRef.current.x = checkpointRef.current;
      playerRef.current.y = 300;
      playerRef.current.vx = 0;
      playerRef.current.vy = 0;
    }
    playerRef.current.invuln = 90;
  }, []);

  const collectWord = useCallback((word) => {
    setWordsLearned((prev) => (prev.includes(word) ? prev : [...prev, word]));
  }, []);

  // ---------- input ----------
  useEffect(() => {
    const down = (e) => {
      if (["ArrowLeft", "a", "A"].includes(e.key)) keysRef.current.left = true;
      if (["ArrowRight", "d", "D"].includes(e.key)) keysRef.current.right = true;
      if (["ArrowUp", "w", "W", " "].includes(e.key)) { keysRef.current.jump = true; e.preventDefault(); }
    };
    const up = (e) => {
      if (["ArrowLeft", "a", "A"].includes(e.key)) keysRef.current.left = false;
      if (["ArrowRight", "d", "D"].includes(e.key)) keysRef.current.right = false;
      if (["ArrowUp", "w", "W", " "].includes(e.key)) keysRef.current.jump = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // ---------- game loop ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const update = (dt) => {
      if (statusRef.current !== "playing") return;
      const p = playerRef.current;
      const k = keysRef.current;

      if (k.left && !k.right) { p.vx -= 0.9 * dt; p.facing = -1; }
      else if (k.right && !k.left) { p.vx += 0.9 * dt; p.facing = 1; }
      else { p.vx *= FRICTION; }
      p.vx = Math.max(-MOVE_SPEED, Math.min(MOVE_SPEED, p.vx));
      if (Math.abs(p.vx) > 0.3) p.anim += dt * 0.3;

      if (k.jump && p.onGround) { p.vy = JUMP_VELOCITY; p.onGround = false; }

      p.vy += GRAVITY * dt;
      if (p.vy > MAX_FALL) p.vy = MAX_FALL;

      p.x += p.vx * dt;
      p.x = Math.max(0, Math.min(LEVEL_WIDTH - PLAYER_W, p.x));
      p.y += p.vy * dt;

      // ground / pit check
      const inPit = PITS.some((pit) => p.x + PLAYER_W / 2 > pit.start && p.x + PLAYER_W / 2 < pit.end);
      p.onGround = false;
      if (!inPit) {
        if (p.y + PLAYER_H >= GROUND_Y && p.vy >= 0) {
          p.y = GROUND_Y - PLAYER_H;
          p.vy = 0;
          p.onGround = true;
        }
      }

      // platform collision (land on top only)
      for (const plat of PLATFORMS) {
        const overlapX = p.x + PLAYER_W > plat.x && p.x < plat.x + plat.w;
        if (overlapX && p.vy >= 0) {
          const prevBottom = p.y + PLAYER_H - p.vy * dt;
          if (prevBottom <= plat.y + 2 && p.y + PLAYER_H >= plat.y) {
            p.y = plat.y - PLAYER_H;
            p.vy = 0;
            p.onGround = true;
          }
        }
      }

      // fell into pit
      if (p.y > CANVAS_H + 60) {
        loseLife(true);
      }

      // checkpoint update
      const passedGate = gatesRef.current.filter((g) => g.open && g.x < p.x).sort((a, b) => b.x - a.x)[0];
      checkpointRef.current = passedGate ? passedGate.x + 40 : 50;

      // zone change
      const z = zoneAt(p.x);
      const zi = ZONES.indexOf(z);
      if (zi !== currentZoneRef.current) {
        currentZoneRef.current = zi;
        setZoneName(z.name);
        showToast(`Welcome to ${z.name}!`);
      }

      // coins
      for (const coin of coinsRef.current) {
        if (coin.collected) continue;
        const dx = Math.abs(p.x + PLAYER_W / 2 - coin.x);
        const dy = Math.abs(p.y + PLAYER_H / 2 - coin.y);
        if (dx < 28 && dy < 28) {
          coin.collected = true;
          if (coin.trap) {
            scoreRef.current = Math.max(0, scoreRef.current - 5);
            setScore(scoreRef.current);
            showToast(`Oops! That's not "${coin.word}" — you lost a heart!`);
            loseLife(false);
          } else {
            scoreRef.current += 10;
            setScore(scoreRef.current);
            collectWord(coin.word);
            showToast(`You found: ${coin.emoji} ${coin.word}`);
          }
        }
      }

      // enemies
      for (const en of enemiesRef.current) {
        if (!en.alive) continue;
        en.x += en.dir * 1.4 * dt;
        if (en.x < en.minX || en.x > en.maxX) en.dir *= -1;
        const overlapX = p.x + PLAYER_W > en.x && p.x < en.x + en.w;
        const overlapY = p.y + PLAYER_H > en.y && p.y < en.y + en.h;
        if (overlapX && overlapY && p.invuln <= 0) {
          const stomping = p.vy > 1 && p.y + PLAYER_H - en.y < 18;
          if (stomping) {
            en.alive = false;
            p.vy = -8;
            scoreRef.current += 20;
            setScore(scoreRef.current);
            showToast(`Squashed! That silly monster said "${en.word}" — wrong zone!`);
          } else {
            p.vx = p.facing === 1 ? -4 : 4;
            loseLife(false);
          }
        }
      }
      if (p.invuln > 0) p.invuln -= dt;

      // gates
      for (const gate of gatesRef.current) {
        if (gate.open) continue;
        if (p.x + PLAYER_W > gate.x && p.x < gate.x + 24) {
          p.x = gate.x - PLAYER_W;
          p.vx = 0;
          statusRef.current = "quiz";
          setStatus("quiz");
          setPendingGate(gate);
          setQuiz(buildQuiz(gate.zoneIdx));
          setQuizFeedback("");
        }
      }

      // win
      if (p.x + PLAYER_W >= FLAG_X) {
        statusRef.current = "won";
        setStatus("won");
      }

      // camera
      cameraRef.current = Math.max(0, Math.min(p.x - CANVAS_W / 2, LEVEL_WIDTH - CANVAS_W));
    };

    const drawRoundedRect = (x, y, w, h, r, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      ctx.fill();
    };

    const draw = () => {
      const p = playerRef.current;
      const cam = cameraRef.current;
      const z = zoneAt(p.x);

      const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
      grad.addColorStop(0, z.sky[0]);
      grad.addColorStop(1, z.sky[1]);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // parallax hills
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      for (let i = 0; i < 6; i++) {
        const hx = (i * 260 - cam * 0.3) % (CANVAS_W + 260) - 130;
        ctx.beginPath();
        ctx.arc(hx, 340, 70, Math.PI, 0);
        ctx.fill();
      }

      ctx.save();
      ctx.translate(-cam, 0);

      // ground segments (skip pits)
      let segStart = 0;
      const sorted = [...PITS].sort((a, b) => a.start - b.start);
      const segments = [];
      for (const pit of sorted) {
        segments.push({ x1: segStart, x2: pit.start });
        segStart = pit.end;
      }
      segments.push({ x1: segStart, x2: LEVEL_WIDTH });
      for (const seg of segments) {
        if (seg.x2 <= cam - 50 || seg.x1 >= cam + CANVAS_W + 50) continue;
        ctx.fillStyle = "#8B5E3C";
        ctx.fillRect(seg.x1, GROUND_Y, seg.x2 - seg.x1, CANVAS_H - GROUND_Y);
        ctx.fillStyle = z.ground;
        ctx.fillRect(seg.x1, GROUND_Y, seg.x2 - seg.x1, 14);
      }

      // platforms
      for (const plat of PLATFORMS) {
        if (plat.x + plat.w < cam - 50 || plat.x > cam + CANVAS_W + 50) continue;
        drawRoundedRect(plat.x, plat.y, plat.w, plat.h, 6, "#C97B4A");
        ctx.fillStyle = "#E8A468";
        ctx.fillRect(plat.x, plat.y, plat.w, 5);
      }

      // coins
      for (const coin of coinsRef.current) {
        if (coin.collected) continue;
        if (coin.x < cam - 50 || coin.x > cam + CANVAS_W + 50) continue;
        const bob = Math.sin(Date.now() / 300 + coin.x) * 3;
        ctx.beginPath();
        ctx.arc(coin.x, coin.y + bob, 16, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fill();
        ctx.font = "20px system-ui, 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(coin.emoji, coin.x, coin.y + bob + 1);
        ctx.font = "bold 10px system-ui, sans-serif";
        ctx.fillStyle = "#2B2333";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(coin.word, coin.x, coin.y + bob + 26);
      }

      // gates
      for (const gate of gatesRef.current) {
        if (gate.open) continue;
        if (gate.x < cam - 50 || gate.x > cam + CANVAS_W + 50) continue;
        drawRoundedRect(gate.x, GROUND_Y - 140, 22, 140, 6, "#4A3F6B");
        ctx.font = "22px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("🔒", gate.x + 11, GROUND_Y - 150);
      }

      // enemies
      for (const en of enemiesRef.current) {
        if (!en.alive) continue;
        if (en.x < cam - 50 || en.x > cam + CANVAS_W + 50) continue;
        drawRoundedRect(en.x, en.y, en.w, en.h, 10, "#8E44AD");
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(en.x + 10, en.y + 12, 4, 0, Math.PI * 2);
        ctx.arc(en.x + 20, en.y + 12, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#2B2333";
        ctx.font = "bold 11px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(en.word, en.x + en.w / 2, en.y - 8);
      }

      // flag
      if (FLAG_X > cam - 50 && FLAG_X < cam + CANVAS_W + 50) {
        ctx.fillStyle = "#5B4A3A";
        ctx.fillRect(FLAG_X, GROUND_Y - 200, 6, 200);
        ctx.fillStyle = "#F2C744";
        ctx.beginPath();
        ctx.moveTo(FLAG_X + 6, GROUND_Y - 195);
        ctx.lineTo(FLAG_X + 60, GROUND_Y - 175);
        ctx.lineTo(FLAG_X + 6, GROUND_Y - 155);
        ctx.closePath();
        ctx.fill();
      }

      // player
      const bounce = p.onGround ? Math.abs(Math.sin(p.anim)) * 3 : 0;
      const px = p.x, py = p.y - bounce;
      const flicker = p.invuln > 0 && Math.floor(p.invuln / 6) % 2 === 0;
      if (!flicker) {
        ctx.save();
        ctx.translate(px + PLAYER_W / 2, py + PLAYER_H / 2);
        ctx.scale(p.facing, 1);
        // legs
        ctx.fillStyle = "#3A2E39";
        const legSwing = p.onGround && Math.abs(p.vx) > 0.4 ? Math.sin(p.anim * 2) * 6 : 0;
        ctx.fillRect(-10, 10 + legSwing * 0.2, 8, 10);
        ctx.fillRect(2, 10 - legSwing * 0.2, 8, 10);
        // body
        drawRoundedRect(-14, -8, 28, 22, 8, "#FF6B4A");
        // head
        ctx.beginPath();
        ctx.arc(4, -18, 12, 0, Math.PI * 2);
        ctx.fillStyle = "#FFD8A8";
        ctx.fill();
        // eye
        ctx.fillStyle = "#2B2333";
        ctx.beginPath();
        ctx.arc(9, -19, 2, 0, Math.PI * 2);
        ctx.fill();
        // cap
        ctx.fillStyle = "#3AAFA9";
        ctx.beginPath();
        ctx.arc(4, -22, 12, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(4, -26, 14, 6);
        ctx.restore();
      }

      ctx.restore();
    };

    const loop = (t) => {
      if (!lastTimeRef.current) lastTimeRef.current = t;
      const dt = Math.min((t - lastTimeRef.current) / 16.67, 2.2);
      lastTimeRef.current = t;
      update(dt);
      draw();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [loseLife, collectWord, showToast]);

  const answerQuiz = (word) => {
    if (!quiz || !pendingGate) return;
    if (word === quiz.correctWord) {
      pendingGate.open = true;
      scoreRef.current += 50;
      setScore(scoreRef.current);
      setQuiz(null);
      setPendingGate(null);
      statusRef.current = "playing";
      setStatus("playing");
      showToast("Gate opened! Great job!");
    } else {
      setQuizFeedback("Not quite — give it another try!");
    }
  };

  const touchStart = (dir) => (e) => { e.preventDefault(); keysRef.current[dir] = true; };
  const touchEnd = (dir) => (e) => { e.preventDefault(); keysRef.current[dir] = false; };

  return (
    <div className="w-full max-w-3xl mx-auto" style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <div className="mb-3 text-center">
        <h1 className="text-3xl font-extrabold" style={{ color: "#2B2333" }}>Word Jump Kingdom</h1>
        <p className="text-sm" style={{ color: "#5B5566" }}>Run, jump, and learn English words along the way</p>
      </div>

      <div
        className="relative mx-auto rounded-2xl overflow-hidden"
        style={{ width: "100%", maxWidth: CANVAS_W, aspectRatio: `${CANVAS_W}/${CANVAS_H}`, border: "6px solid #2B2333", boxShadow: "8px 8px 0 rgba(43,35,51,0.25)", touchAction: "none" }}
      >
        <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} style={{ width: "100%", height: "100%", display: "block" }} />

        {/* HUD */}
        {status !== "start" && (
          <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none">
            <div className="flex gap-2">
              <div className="px-3 py-1 rounded-full text-sm font-bold" style={{ background: "#FFF3D6", color: "#2B2333", border: "2px solid #2B2333" }}>
                Score: {score}
              </div>
              <div className="px-3 py-1 rounded-full text-sm font-bold" style={{ background: "#FFF3D6", color: "#2B2333", border: "2px solid #2B2333" }}>
                {"❤️".repeat(Math.max(lives, 0))}{"🖤".repeat(Math.max(3 - lives, 0))}
              </div>
            </div>
            <div className="px-3 py-1 rounded-full text-sm font-bold" style={{ background: "#FFF3D6", color: "#2B2333", border: "2px solid #2B2333" }}>
              {zoneName}
            </div>
          </div>
        )}

        {toast && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl text-sm font-bold text-center" style={{ background: "#2B2333", color: "#FFF3D6" }}>
            {toast}
          </div>
        )}

        {/* Start screen */}
        {status === "start" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center px-6" style={{ background: "rgba(43,35,51,0.85)" }}>
            <p className="text-2xl">🏃‍♂️🐱🔵5️⃣</p>
            <p className="text-white font-bold text-lg">Collect words, answer question gates,<br />and stomp the silly wrong-word monsters!</p>
            <p className="text-white text-sm opacity-80">Read before you grab a coin — some show the wrong word for the picture.<br />Grab a wrong one and you lose a heart. Lose all 3 and it's game over!</p>
            <p className="text-white text-sm opacity-80">Arrow keys / A-D to move · Space or Up to jump<br />(or use the buttons below on a touch screen)</p>
            <button
              onClick={resetGame}
              className="px-6 py-3 rounded-full font-bold text-white"
              style={{ background: "#3AAFA9", border: "3px solid #2B2333", boxShadow: "4px 4px 0 rgba(0,0,0,0.3)" }}
            >
              Start playing
            </button>
          </div>
        )}

        {/* Quiz overlay */}
        {status === "quiz" && quiz && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6" style={{ background: "rgba(43,35,51,0.9)" }}>
            <div className="text-5xl">{quiz.emoji}</div>
            <p className="text-white font-bold">Which word matches this picture?</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {quiz.options.map((opt) => (
                <button
                  key={opt}
                  onClick={() => answerQuiz(opt)}
                  className="px-5 py-2 rounded-full font-bold"
                  style={{ background: "#FFF3D6", color: "#2B2333", border: "3px solid #2B2333" }}
                >
                  {opt}
                </button>
              ))}
            </div>
            {quizFeedback && <p className="text-white text-sm">{quizFeedback}</p>}
          </div>
        )}

        {/* Win screen */}
        {status === "won" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6" style={{ background: "rgba(43,35,51,0.92)" }}>
            <p className="text-3xl">🏆</p>
            <p className="text-white font-extrabold text-xl">You reached the flag!</p>
            <p className="text-white">Final score: {score}</p>
            <p className="text-white text-sm max-w-sm">Words learned: {wordsLearned.join(", ") || "none yet"}</p>
            <button
              onClick={resetGame}
              className="px-6 py-3 rounded-full font-bold text-white"
              style={{ background: "#3AAFA9", border: "3px solid #2B2333", boxShadow: "4px 4px 0 rgba(0,0,0,0.3)" }}
            >
              Play again
            </button>
          </div>
        )}

        {/* Lose screen */}
        {status === "lost" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6" style={{ background: "rgba(43,35,51,0.92)" }}>
            <p className="text-3xl">💫</p>
            <p className="text-white font-extrabold text-xl">Out of hearts!</p>
            <p className="text-white">Score: {score} · Words learned: {wordsLearned.length}</p>
            <button
              onClick={resetGame}
              className="px-6 py-3 rounded-full font-bold text-white"
              style={{ background: "#3AAFA9", border: "3px solid #2B2333", boxShadow: "4px 4px 0 rgba(0,0,0,0.3)" }}
            >
              Try again
            </button>
          </div>
        )}
      </div>

      {/* touch controls */}
      <div className="flex items-center justify-between mt-4 max-w-3xl mx-auto px-2">
        <div className="flex gap-2">
          <button
            onMouseDown={touchStart("left")} onMouseUp={touchEnd("left")} onMouseLeave={touchEnd("left")}
            onTouchStart={touchStart("left")} onTouchEnd={touchEnd("left")} onTouchCancel={touchEnd("left")}
            className="w-14 h-14 rounded-full font-bold text-xl select-none"
            style={{ background: "#FFF3D6", border: "3px solid #2B2333", touchAction: "none", WebkitTapHighlightColor: "transparent" }}
          >◀</button>
          <button
            onMouseDown={touchStart("right")} onMouseUp={touchEnd("right")} onMouseLeave={touchEnd("right")}
            onTouchStart={touchStart("right")} onTouchEnd={touchEnd("right")} onTouchCancel={touchEnd("right")}
            className="w-14 h-14 rounded-full font-bold text-xl select-none"
            style={{ background: "#FFF3D6", border: "3px solid #2B2333", touchAction: "none", WebkitTapHighlightColor: "transparent" }}
          >▶</button>
        </div>
        <button
          onMouseDown={touchStart("jump")} onMouseUp={touchEnd("jump")} onMouseLeave={touchEnd("jump")}
          onTouchStart={touchStart("jump")} onTouchEnd={touchEnd("jump")} onTouchCancel={touchEnd("jump")}
          className="w-20 h-14 rounded-full font-bold select-none"
          style={{ background: "#3AAFA9", color: "#fff", border: "3px solid #2B2333", touchAction: "none", WebkitTapHighlightColor: "transparent" }}
        >JUMP</button>
      </div>

      {wordsLearned.length > 0 && status !== "start" && (
        <div className="mt-3 text-center text-sm" style={{ color: "#5B5566" }}>
          Words collected so far: {wordsLearned.join(", ")}
        </div>
      )}
    </div>
  );
}