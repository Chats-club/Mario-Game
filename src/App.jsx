import React, { useRef, useEffect, useState, useCallback } from "react";

// ---------- Constants ----------
const CANVAS_W = 800;
const CANVAS_H = 640;
const GROUND_Y = 560;
const GRAVITY = 0.55;
const JUMP_VELOCITY = -11.5;
const MOVE_SPEED = 4.2;
const FRICTION = 0.82;
const MAX_FALL = 14;
const PLAYER_W = 48;
const PLAYER_H = 62;
const LEVELS_PER_WORLD = 3;

const WORLD_THEMES = [
  { name: "Animal Land", sky: ["#8FD3E8", "#C9F0D8"], ground: "#6FA85B" },
  { name: "Color Land", sky: ["#F4C9E8", "#FDE6C9"], ground: "#C97BB0" },
  { name: "Number Land", sky: ["#C9D6F4", "#E8DBF9"], ground: "#6B7FD1" },
];

const ANIMAL_VOCAB = [
  { emoji: "🐱", word: "Cat" }, { emoji: "🐶", word: "Dog" }, { emoji: "🐘", word: "Elephant" },
  { emoji: "🐸", word: "Frog" }, { emoji: "🐦", word: "Bird" }, { emoji: "🐟", word: "Fish" },
  { emoji: "🦁", word: "Lion" }, { emoji: "🦆", word: "Duck" }, { emoji: "🐻", word: "Bear" },
];
const COLOR_VOCAB = [
  { emoji: "🟥", word: "Red" }, { emoji: "🟦", word: "Blue" }, { emoji: "🟨", word: "Yellow" },
  { emoji: "🟩", word: "Green" }, { emoji: "🟪", word: "Purple" }, { emoji: "🟧", word: "Orange" },
  { emoji: "⬛", word: "Black" }, { emoji: "⬜", word: "White" }, { emoji: "🟫", word: "Brown" },
];
const NUMBER_VOCAB = [
  { emoji: "1️⃣", word: "One" }, { emoji: "2️⃣", word: "Two" }, { emoji: "3️⃣", word: "Three" },
  { emoji: "4️⃣", word: "Four" }, { emoji: "5️⃣", word: "Five" }, { emoji: "6️⃣", word: "Six" },
  { emoji: "7️⃣", word: "Seven" }, { emoji: "8️⃣", word: "Eight" }, { emoji: "9️⃣", word: "Nine" },
];
const WORLD_VOCAB = [ANIMAL_VOCAB, COLOR_VOCAB, NUMBER_VOCAB];
const ALL_VOCAB = [...ANIMAL_VOCAB, ...COLOR_VOCAB, ...NUMBER_VOCAB];

const mkCoin = (x, y, emoji, word) => ({ x, y, emoji, word, trap: false, collected: false });
const mkTrap = (x, y, emoji, word) => ({ x, y, emoji, word, trap: true, collected: false });
const mkEnemy = (x, minX, maxX, word) => ({ x, minX, maxX, y: 530, dir: 1, alive: true, word, w: 30, h: 30 });

// Procedurally build one of the 9 levels. Later levels in a world get a pit,
// more trap coins, and more enemies, so difficulty ramps up like real Mario worlds.
function buildLevel(worldIdx, levelIdx) {
  const vocab = WORLD_VOCAB[worldIdx].slice(levelIdx * 3, levelIdx * 3 + 3);
  const otherPool = ALL_VOCAB.filter((v) => !vocab.includes(v));
  const width = 1750;

  const pits = levelIdx > 0 ? [{ start: 900, end: 900 + 80 + levelIdx * 20 }] : [];

  const platforms = [
    { x: 300, y: 480 - levelIdx * 10, w: 110, h: 20 },
    { x: 780, y: 435 - levelIdx * 15, w: 100, h: 20 },
    { x: 1280, y: 470 - levelIdx * 10, w: 120, h: 20 },
  ];

  const coins = [
    mkCoin(200, 530, vocab[0].emoji, vocab[0].word),
    mkCoin(platforms[1].x + 30, platforms[1].y - 25, vocab[1].emoji, vocab[1].word),
    mkCoin(platforms[2].x + 40, platforms[2].y - 25, vocab[2].emoji, vocab[2].word),
  ];

  const traps = [];
  for (let i = 0; i <= levelIdx; i++) {
    const pic = vocab[i % vocab.length];
    const wrongLabel = vocab[(i + 1) % vocab.length].word;
    traps.push(mkTrap(520 + i * 420, 530, pic.emoji, wrongLabel));
  }

  const enemies = [];
  for (let i = 0; i <= levelIdx; i++) {
    const label = otherPool[(i + worldIdx + levelIdx * 3) % otherPool.length].word;
    const ex = 650 + i * 430;
    enemies.push(mkEnemy(ex, ex - 90, ex + 90, label));
  }

  return { width, pits, platforms, coins, traps, enemies, castleX: width - 90, vocab };
}

function buildBossQuiz(vocab) {
  const correct = vocab[Math.floor(Math.random() * vocab.length)];
  const distractorPool = ALL_VOCAB.filter((v) => v.word !== correct.word);
  const distractors = [...distractorPool].sort(() => Math.random() - 0.5).slice(0, 2);
  const options = [correct, ...distractors].sort(() => Math.random() - 0.5);
  return { emoji: correct.emoji, correctWord: correct.word, options: options.map((o) => o.word) };
}

const levelKey = (w, l) => `${w}-${l}`;

export default function WordJumpKingdom() {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const lastTimeRef = useRef(0);
  const keysRef = useRef({ left: false, right: false, jump: false });
  const toastTimerRef = useRef(null);

  const playerRef = useRef({ x: 50, y: 300, vx: 0, vy: 0, onGround: false, facing: 1, anim: 0, invuln: 0 });
  const cameraRef = useRef(0);
  const levelRef = useRef(null); // { width, pits, platforms, coins, traps, enemies, castleX, vocab }
  const currentPosRef = useRef({ world: 0, level: 0 });
  const scoreRef = useRef(0);
  const livesRef = useRef(3);
  const statusRef = useRef("start"); // start | map | playing | quiz | levelComplete | worldComplete | gameComplete | lost

  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [status, setStatus] = useState("start");
  const [wordsLearned, setWordsLearned] = useState([]);
  const [toast, setToast] = useState("");
  const [quiz, setQuiz] = useState(null);
  const [quizFeedback, setQuizFeedback] = useState("");
  const [completed, setCompleted] = useState([]); // array of "w-l" keys
  const [currentPos, setCurrentPos] = useState({ world: 0, level: 0 });

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(""), 1700);
  }, []);

  const isUnlocked = useCallback((w, l, completedList) => {
    if (w === 0 && l === 0) return true;
    if (l > 0) return completedList.includes(levelKey(w, l - 1));
    return completedList.includes(levelKey(w - 1, LEVELS_PER_WORLD - 1));
  }, []);

  const loadLevel = useCallback((w, l) => {
    const lvl = buildLevel(w, l);
    levelRef.current = lvl;
    currentPosRef.current = { world: w, level: l };
    setCurrentPos({ world: w, level: l });
    playerRef.current = { x: 50, y: 300, vx: 0, vy: 0, onGround: false, facing: 1, anim: 0, invuln: 0 };
    cameraRef.current = 0;
    livesRef.current = 3;
    setLives(3);
    statusRef.current = "playing";
    setStatus("playing");
    showToast(`${WORLD_THEMES[w].name} — Level ${w + 1}-${l + 1}`);
  }, [showToast]);

  const startGame = useCallback(() => {
    scoreRef.current = 0;
    setScore(0);
    setWordsLearned([]);
    setCompleted([]);
    statusRef.current = "map";
    setStatus("map");
  }, []);

  const backToMap = useCallback(() => {
    statusRef.current = "map";
    setStatus("map");
  }, []);

  const retryLevel = useCallback(() => {
    const { world, level } = currentPosRef.current;
    loadLevel(world, level);
  }, [loadLevel]);

  const loseLife = useCallback((teleport) => {
    livesRef.current -= 1;
    setLives(livesRef.current);
    if (livesRef.current <= 0) {
      statusRef.current = "lost";
      setStatus("lost");
      return;
    }
    if (teleport) {
      playerRef.current.x = 50;
      playerRef.current.y = 300;
      playerRef.current.vx = 0;
      playerRef.current.vy = 0;
    }
    playerRef.current.invuln = 90;
  }, []);

  const collectWord = useCallback((word) => {
    setWordsLearned((prev) => (prev.includes(word) ? prev : [...prev, word]));
  }, []);

  const completeLevel = useCallback(() => {
    const { world, level } = currentPosRef.current;
    const key = levelKey(world, level);
    setCompleted((prev) => (prev.includes(key) ? prev : [...prev, key]));
    scoreRef.current += 50;
    setScore(scoreRef.current);
    const isLastLevelOfWorld = level === LEVELS_PER_WORLD - 1;
    const isLastWorld = world === WORLD_THEMES.length - 1;
    if (isLastLevelOfWorld && isLastWorld) {
      statusRef.current = "gameComplete";
      setStatus("gameComplete");
    } else if (isLastLevelOfWorld) {
      statusRef.current = "worldComplete";
      setStatus("worldComplete");
    } else {
      statusRef.current = "levelComplete";
      setStatus("levelComplete");
    }
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
      const lvl = levelRef.current;
      if (!lvl) return;
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
      p.x = Math.max(0, Math.min(lvl.width - PLAYER_W, p.x));
      p.y += p.vy * dt;

      const inPit = lvl.pits.some((pit) => p.x + PLAYER_W / 2 > pit.start && p.x + PLAYER_W / 2 < pit.end);
      p.onGround = false;
      if (!inPit) {
        if (p.y + PLAYER_H >= GROUND_Y && p.vy >= 0) {
          p.y = GROUND_Y - PLAYER_H;
          p.vy = 0;
          p.onGround = true;
        }
      }

      for (const plat of lvl.platforms) {
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

      if (p.y > CANVAS_H + 60) loseLife(true);

      for (const coin of lvl.coins) {
        if (coin.collected) continue;
        const dx = Math.abs(p.x + PLAYER_W / 2 - coin.x);
        const dy = Math.abs(p.y + PLAYER_H / 2 - coin.y);
        if (dx < 28 && dy < 28) {
          coin.collected = true;
          scoreRef.current += 10;
          setScore(scoreRef.current);
          collectWord(coin.word);
          showToast(`You found: ${coin.emoji} ${coin.word}`);
        }
      }
      for (const trap of lvl.traps) {
        if (trap.collected) continue;
        const dx = Math.abs(p.x + PLAYER_W / 2 - trap.x);
        const dy = Math.abs(p.y + PLAYER_H / 2 - trap.y);
        if (dx < 28 && dy < 28) {
          trap.collected = true;
          scoreRef.current = Math.max(0, scoreRef.current - 5);
          setScore(scoreRef.current);
          showToast(`Oops! That's not "${trap.word}" — you lost a heart!`);
          loseLife(false);
        }
      }

      for (const en of lvl.enemies) {
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
            showToast(`Squashed! That silly monster said "${en.word}" — wrong here!`);
          } else {
            p.vx = p.facing === 1 ? -4 : 4;
            loseLife(false);
          }
        }
      }
      if (p.invuln > 0) p.invuln -= dt;

      if (p.x + PLAYER_W >= lvl.castleX) {
        statusRef.current = "quiz";
        setStatus("quiz");
        setQuiz(buildBossQuiz(lvl.vocab));
        setQuizFeedback("");
        p.vx = 0;
      }

      cameraRef.current = Math.max(0, Math.min(p.x - CANVAS_W / 2, lvl.width - CANVAS_W));
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
      const lvl = levelRef.current;
      if (!lvl) { ctx.fillStyle = "#8FD3E8"; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H); return; }
      const p = playerRef.current;
      const cam = cameraRef.current;
      const theme = WORLD_THEMES[currentPosRef.current.world];

      const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
      grad.addColorStop(0, theme.sky[0]);
      grad.addColorStop(1, theme.sky[1]);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      ctx.fillStyle = "rgba(255,255,255,0.35)";
      for (let i = 0; i < 6; i++) {
        const hx = ((i * 260 - cam * 0.3) % (CANVAS_W + 260)) - 130;
        ctx.beginPath();
        ctx.arc(hx, 520, 70, Math.PI, 0);
        ctx.fill();
      }

      ctx.save();
      ctx.translate(-cam, 0);

      let segStart = 0;
      const sorted = [...lvl.pits].sort((a, b) => a.start - b.start);
      const segments = [];
      for (const pit of sorted) { segments.push({ x1: segStart, x2: pit.start }); segStart = pit.end; }
      segments.push({ x1: segStart, x2: lvl.width });
      for (const seg of segments) {
        if (seg.x2 <= cam - 50 || seg.x1 >= cam + CANVAS_W + 50) continue;
        ctx.fillStyle = "#8B5E3C";
        ctx.fillRect(seg.x1, GROUND_Y, seg.x2 - seg.x1, CANVAS_H - GROUND_Y);
        ctx.fillStyle = theme.ground;
        ctx.fillRect(seg.x1, GROUND_Y, seg.x2 - seg.x1, 14);
      }

      for (const plat of lvl.platforms) {
        if (plat.x + plat.w < cam - 50 || plat.x > cam + CANVAS_W + 50) continue;
        drawRoundedRect(plat.x, plat.y, plat.w, plat.h, 6, "#C97B4A");
        ctx.fillStyle = "#E8A468";
        ctx.fillRect(plat.x, plat.y, plat.w, 5);
      }

      for (const item of [...lvl.coins, ...lvl.traps]) {
        if (item.collected) continue;
        if (item.x < cam - 50 || item.x > cam + CANVAS_W + 50) continue;
        const bob = Math.sin(Date.now() / 300 + item.x) * 3;
        ctx.beginPath();
        ctx.arc(item.x, item.y + bob, 16, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fill();
        ctx.font = "20px system-ui, 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(item.emoji, item.x, item.y + bob + 1);
        ctx.font = "bold 10px system-ui, sans-serif";
        ctx.fillStyle = "#2B2333";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(item.word, item.x, item.y + bob + 26);
      }

      for (const en of lvl.enemies) {
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

      // castle
      if (lvl.castleX > cam - 120 && lvl.castleX < cam + CANVAS_W + 50) {
        const cx = lvl.castleX;
        ctx.fillStyle = "#B7A08C";
        ctx.fillRect(cx - 20, GROUND_Y - 90, 100, 90);
        ctx.fillRect(cx - 35, GROUND_Y - 60, 20, 60);
        ctx.fillRect(cx + 65, GROUND_Y - 60, 20, 60);
        ctx.fillStyle = "#8B7663";
        ctx.fillRect(cx - 20, GROUND_Y - 100, 100, 12);
        ctx.fillRect(cx - 37, GROUND_Y - 70, 24, 12);
        ctx.fillRect(cx + 63, GROUND_Y - 70, 24, 12);
        drawRoundedRect(cx + 18, GROUND_Y - 40, 24, 40, 6, "#4A3F6B");
        ctx.fillStyle = "#2B2333";
        ctx.font = "18px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("🏰", cx + 30, GROUND_Y - 105);
      }

      const bounce = p.onGround ? Math.abs(Math.sin(p.anim)) * 3 : 0;
      const px = p.x, py = p.y - bounce;
      const flicker = p.invuln > 0 && Math.floor(p.invuln / 6) % 2 === 0;
      if (!flicker) {
        ctx.save();
        ctx.translate(px + PLAYER_W / 2, py + PLAYER_H / 2);
        ctx.scale(p.facing, 1);
        // legs
        ctx.fillStyle = "#3A2E39";
        const legSwing = p.onGround && Math.abs(p.vx) > 0.4 ? Math.sin(p.anim * 2) * 8 : 0;
        ctx.fillRect(-16, 14 + legSwing * 0.2, 13, 17);
        ctx.fillRect(3, 14 - legSwing * 0.2, 13, 17);
        // small body (chibi = big head, small body)
        drawRoundedRect(-22, -13, 45, 34, 13, "#FF6B4A");
        // stubby arms
        ctx.fillStyle = "#FF6B4A";
        drawRoundedRect(-27, -6, 8, 16, 4, "#FF6B4A");
        drawRoundedRect(19, -6, 8, 16, 4, "#FF6B4A");
        // big head
        ctx.beginPath();
        ctx.arc(6, -29, 19, 0, Math.PI * 2);
        ctx.fillStyle = "#FFD8A8";
        ctx.fill();
        // blush
        ctx.fillStyle = "rgba(255,140,140,0.5)";
        ctx.beginPath();
        ctx.arc(-2, -23, 3.5, 0, Math.PI * 2);
        ctx.fill();
        // eye
        ctx.fillStyle = "#2B2333";
        ctx.beginPath();
        ctx.arc(15, -30, 3, 0, Math.PI * 2);
        ctx.fill();
        // cap
        ctx.fillStyle = "#3AAFA9";
        ctx.beginPath();
        ctx.arc(6, -35, 19, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(6, -42, 23, 10);
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
    if (!quiz) return;
    if (word === quiz.correctWord) {
      setQuiz(null);
      completeLevel();
    } else {
      setQuizFeedback("Not quite — give it another try!");
    }
  };

  const press = (dir) => (e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); keysRef.current[dir] = true; };
  const release = (dir) => (e) => { e.preventDefault(); keysRef.current[dir] = false; };

  const { world: curW, level: curL } = currentPos;

  // Reusable inline style objects (no CSS framework required)
  const overlayStyle = (bg) => ({
    position: "fixed", inset: 0, zIndex: 1000, display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center",
    padding: "24px", background: bg, boxSizing: "border-box",
    overflowY: "auto", maxHeight: "100vh",
  });
  const pillStyle = (bg, color, border) => ({
    padding: "4px 12px", borderRadius: 999, fontSize: 14, fontWeight: 700, background: bg, color, border,
  });
  const primaryBtnStyle = {
    padding: "12px 24px", borderRadius: 999, fontWeight: 700, color: "#fff",
    background: "#3AAFA9", border: "3px solid #2B2333", boxShadow: "4px 4px 0 rgba(0,0,0,0.3)", cursor: "pointer",
  };
  const secondaryBtnStyle = {
    padding: "12px 24px", borderRadius: 999, fontWeight: 700, color: "#2B2333",
    background: "#FFF3D6", border: "3px solid #2B2333", cursor: "pointer",
  };
  const optionBtnStyle = {
    padding: "8px 20px", borderRadius: 999, fontWeight: 700, color: "#2B2333",
    background: "#FFF3D6", border: "3px solid #2B2333", cursor: "pointer",
  };
  const dpadBtnStyle = {
    width: 56, height: 56, borderRadius: "50%", fontWeight: 700, fontSize: 20,
    background: "#FFF3D6", border: "3px solid #2B2333", touchAction: "none",
    WebkitTapHighlightColor: "transparent", userSelect: "none", cursor: "pointer",
  };
  const jumpBtnStyle = {
    width: 80, height: 56, borderRadius: 999, fontWeight: 700, color: "#fff",
    background: "#3AAFA9", border: "3px solid #2B2333", touchAction: "none",
    WebkitTapHighlightColor: "transparent", userSelect: "none", cursor: "pointer",
  };

  return (
    <div style={{ width: "100%", maxWidth: 768, margin: "0 auto", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <div style={{ marginBottom: 12, textAlign: "center" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#2B2333", margin: 0 }}>Word Jump Kingdom</h1>
        <p style={{ fontSize: 14, color: "#5B5566", margin: "4px 0 0" }}>3 worlds · 9 levels · a castle quiz at the end of every one</p>
      </div>

      <div
        style={{ position: "relative", width: "100%", maxWidth: CANVAS_W, margin: "0 auto", borderRadius: 16, overflow: "hidden", aspectRatio: `${CANVAS_W}/${CANVAS_H}`, border: "6px solid #2B2333", boxShadow: "8px 8px 0 rgba(43,35,51,0.25)", touchAction: "none" }}
      >
        <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} style={{ width: "100%", height: "100%", display: "block" }} />

        {(status === "playing" || status === "quiz") && (
          <div style={{ position: "absolute", top: 8, left: 8, right: 8, display: "flex", alignItems: "center", justifyContent: "space-between", pointerEvents: "none" }}>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={pillStyle("#FFF3D6", "#2B2333", "2px solid #2B2333")}>Score: {score}</div>
              <div style={pillStyle("#FFF3D6", "#2B2333", "2px solid #2B2333")}>
                {"❤️".repeat(Math.max(lives, 0))}{"🖤".repeat(Math.max(3 - lives, 0))}
              </div>
            </div>
            <div style={pillStyle("#FFF3D6", "#2B2333", "2px solid #2B2333")}>
              {WORLD_THEMES[curW].name} {curW + 1}-{curL + 1}
            </div>
          </div>
        )}

        {toast && status !== "start" && status !== "map" && (
          <div style={{ position: "absolute", top: 56, left: "50%", transform: "translateX(-50%)", padding: "8px 16px", borderRadius: 12, fontSize: 14, fontWeight: 700, textAlign: "center", background: "#2B2333", color: "#FFF3D6", whiteSpace: "nowrap" }}>
            {toast}
          </div>
        )}

        {status === "start" && (
          <div style={overlayStyle("rgba(43,35,51,0.85)")}>
            <p style={{ fontSize: 24, margin: 0 }}>🏃‍♂️🐱🟥3️⃣🏰</p>
            <p style={{ color: "#fff", fontWeight: 700, fontSize: 18, margin: 0 }}>3 worlds, 3 levels each, and a castle quiz to finish every level!</p>
            <p style={{ color: "#fff", fontSize: 14, opacity: 0.8, margin: 0 }}>Read before you grab a coin — some show the wrong word for the picture.<br />Grab a wrong one and you lose a heart. Lose all 3 and it's game over.</p>
            <p style={{ color: "#fff", fontSize: 14, opacity: 0.8, margin: 0 }}>Arrow keys / A-D to move · Space or Up to jump<br />(or use the buttons below on a touch screen)</p>
            <button onClick={startGame} style={primaryBtnStyle}>Start playing</button>
          </div>
        )}

        {status === "map" && (
          <div style={{ ...overlayStyle("rgba(43,35,51,0.92)"), overflowY: "auto", padding: "24px" }}>
            <p style={{ color: "#fff", fontWeight: 800, fontSize: 20, margin: 0 }}>World Map</p>
            {WORLD_THEMES.map((w, wi) => (
              <div key={w.name} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <p style={{ color: "#fff", fontWeight: 700, fontSize: 14, margin: 0 }}>{w.name}</p>
                <div style={{ display: "flex", gap: 12 }}>
                  {[0, 1, 2].map((li) => {
                    const key = levelKey(wi, li);
                    const done = completed.includes(key);
                    const unlocked = isUnlocked(wi, li, completed);
                    return (
                      <button
                        key={key}
                        disabled={!unlocked}
                        onClick={() => loadLevel(wi, li)}
                        style={{
                          width: 56, height: 56, borderRadius: "50%", fontWeight: 700,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          background: done ? "#F2C744" : unlocked ? "#FFF3D6" : "#5B5566",
                          color: "#2B2333", border: "3px solid #2B2333",
                          opacity: unlocked ? 1 : 0.6, cursor: unlocked ? "pointer" : "not-allowed",
                        }}
                      >
                        {done ? "⭐" : unlocked ? `${wi + 1}-${li + 1}` : "🔒"}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <p style={{ color: "#fff", fontSize: 14, opacity: 0.8, marginTop: 8 }}>Score so far: {score}</p>
          </div>
        )}

        {status === "quiz" && quiz && (
          <div style={overlayStyle("rgba(43,35,51,0.9)")}>
            <p style={{ color: "#fff", fontWeight: 700, fontSize: 14, margin: 0 }}>🏰 Castle Gate</p>
            <div style={{ fontSize: 48 }}>{quiz.emoji}</div>
            <p style={{ color: "#fff", fontWeight: 700, margin: 0 }}>Which word matches this picture?</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
              {quiz.options.map((opt) => (
                <button key={opt} onClick={() => answerQuiz(opt)} style={optionBtnStyle}>{opt}</button>
              ))}
            </div>
            {quizFeedback && <p style={{ color: "#fff", fontSize: 14, margin: 0 }}>{quizFeedback}</p>}
          </div>
        )}

        {status === "levelComplete" && (
          <div style={overlayStyle("rgba(43,35,51,0.92)")}>
            <p style={{ fontSize: 32, margin: 0 }}>🎉</p>
            <p style={{ color: "#fff", fontWeight: 800, fontSize: 20, margin: 0 }}>Level {curW + 1}-{curL + 1} complete!</p>
            <p style={{ color: "#fff", margin: 0 }}>Score: {score}</p>
            <button onClick={backToMap} style={primaryBtnStyle}>Back to map</button>
          </div>
        )}

        {status === "worldComplete" && (
          <div style={overlayStyle("rgba(43,35,51,0.92)")}>
            <p style={{ fontSize: 32, margin: 0 }}>🏆</p>
            <p style={{ color: "#fff", fontWeight: 800, fontSize: 20, margin: 0 }}>{WORLD_THEMES[curW].name} complete!</p>
            <p style={{ color: "#fff", margin: 0 }}>Score: {score}</p>
            <button onClick={backToMap} style={primaryBtnStyle}>Continue to next world</button>
          </div>
        )}

        {status === "gameComplete" && (
          <div style={overlayStyle("rgba(43,35,51,0.94)")}>
            <p style={{ fontSize: 32, margin: 0 }}>👑</p>
            <p style={{ color: "#fff", fontWeight: 800, fontSize: 20, margin: 0 }}>You beat all 3 worlds!</p>
            <p style={{ color: "#fff", margin: 0 }}>Final score: {score}</p>
            <p style={{ color: "#fff", fontSize: 14, maxWidth: 380, margin: 0 }}>Words learned ({wordsLearned.length}): {wordsLearned.join(", ")}</p>
            <button onClick={startGame} style={primaryBtnStyle}>Play again</button>
          </div>
        )}

        {status === "lost" && (
          <div style={overlayStyle("rgba(43,35,51,0.92)")}>
            <p style={{ fontSize: 32, margin: 0 }}>💫</p>
            <p style={{ color: "#fff", fontWeight: 800, fontSize: 20, margin: 0 }}>Out of hearts!</p>
            <p style={{ color: "#fff", margin: 0 }}>Level {curW + 1}-{curL + 1} · Score: {score}</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={retryLevel} style={primaryBtnStyle}>Retry level</button>
              <button onClick={backToMap} style={secondaryBtnStyle}>World map</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, maxWidth: 768, marginLeft: "auto", marginRight: "auto", padding: "0 8px" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button onPointerDown={press("left")} onPointerUp={release("left")} onPointerLeave={release("left")} onPointerCancel={release("left")} style={dpadBtnStyle}>◀</button>
          <button onPointerDown={press("right")} onPointerUp={release("right")} onPointerLeave={release("right")} onPointerCancel={release("right")} style={dpadBtnStyle}>▶</button>
        </div>
        <button onPointerDown={press("jump")} onPointerUp={release("jump")} onPointerLeave={release("jump")} onPointerCancel={release("jump")} style={jumpBtnStyle}>JUMP</button>
      </div>

      {wordsLearned.length > 0 && status !== "start" && status !== "map" && (
        <div style={{ marginTop: 12, textAlign: "center", fontSize: 14, color: "#5B5566" }}>
          Words collected so far: {wordsLearned.join(", ")}
        </div>
      )}
    </div>
  );
}