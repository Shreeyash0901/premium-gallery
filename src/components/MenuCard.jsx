import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
} from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, X, ZoomIn } from "lucide-react";

// Your real menu card photos + logo crop.
// Files are in outputs/assets/ — drop them into src/assets/ and keep these import paths (or adjust).
import logo from "../assets/new-vatika-logo-crop.png";
import menuStarters from "../assets/menu3.jpeg";
import menuChinese from "../assets/menu1.jpeg";
import menuFastFood from "../assets/menu2.jpeg";
import bgTexture from "../assets/background.png";

const menus = [
  { title: "Momos & More", subtitle: "Soups • Cold Beverages • Mocktails • Shakes", image: menuStarters },
  { title: "Chinese & Noodles", subtitle: "Starters • Fried Rice • Maggie", image: menuChinese },
  { title: "Pizza & Fast Food", subtitle: "Sandwich • Burger • Pasta • Fries", image: menuFastFood },
];

// --- Brand palette, sampled directly from the New Vatika Café signboard & logo ---
const COLORS = {
  ink: "#201B21", // signboard backdrop black
  terracotta: "#974933", // signboard board colour
  gold: "#33312c", // logo utensils + "Menu" script
  yellow: "#FFC801", // sunburst backdrop
  cream: "#FEF7EF", // menu-card paper tone
  creamDeep: "#F5E9DA",
};

const SWIPE_THRESHOLD = 60;
const DISMISS_THRESHOLD = 120;
const MAX_ZOOM = 3;
const DOUBLE_TAP_ZOOM = 2.4;

// Card enter/exit: directional wipe + depth (scale/blur) so it reads as a
// physical card sliding into a lit stage, not a flat crossfade.
const wipeVariants = {
  enter: (dir) => ({
    clipPath: dir >= 0 ? "inset(0 0 0 100%)" : "inset(0 100% 0 0)",
    opacity: 0,
    scale: 0.96,
    filter: "blur(6px)",
  }),
  center: {
    clipPath: "inset(0 0 0 0)",
    opacity: 1,
    scale: 1,
    filter: "blur(0px)",
  },
  exit: (dir) => ({
    clipPath: dir >= 0 ? "inset(0 100% 0 0)" : "inset(0 0 0 100%)",
    opacity: 0,
    scale: 0.96,
    filter: "blur(6px)",
  }),
};

const titleVariants = {
  enter: { opacity: 0, y: 16, filter: "blur(6px)" },
  center: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -16, filter: "blur(6px)" },
};

/* -------------------------------------------------------------------------- */
/*  Magnetic button — nudges toward the cursor within a small radius, snaps   */
/*  back with a spring on release. Used for every circular control.          */
/* -------------------------------------------------------------------------- */
function MagneticIconButton({ onClick, label, children, size = 48, tone = "light" }) {
  const ref = useRef(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 300, damping: 20, mass: 0.4 });
  const springY = useSpring(y, { stiffness: 300, damping: 20, mass: 0.4 });

  const handleMove = (e) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const relX = e.clientX - (rect.left + rect.width / 2);
    const relY = e.clientY - (rect.top + rect.height / 2);
    x.set(relX * 0.35);
    y.set(relY * 0.35);
  };
  const handleLeave = () => {
    x.set(0);
    y.set(0);
  };

  const palette =
    tone === "light"
      ? { background: "#FFFFFF", color: COLORS.ink, shadow: `0 10px 28px ${COLORS.ink}30` }
      : { background: `${COLORS.gold}22`, color: COLORS.cream, shadow: "none", border: `1px solid ${COLORS.gold}66` };

  return (
    <motion.button
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onClick={onClick}
      aria-label={label}
      style={{ x: springX, y: springY, width: size, height: size, ...palette }}
      whileTap={{ scale: 0.88 }}
      className="rounded-full flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      {children}
    </motion.button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Progress indicator — a sliding pill that morphs between stops via         */
/*  layout animation, paired with a live "01 / 03" counter.                   */
/* -------------------------------------------------------------------------- */
function ProgressIndicator({ menus, active, onSelect }) {
  return (
    <div className="flex flex-col items-center gap-3 mt-8 sm:mt-10">
      <div className="flex items-center gap-2 sm:gap-3">
        {menus.map((m, i) => (
          <button
            key={m.title}
            onClick={() => onSelect(i)}
            aria-label={`Go to ${m.title}`}
            aria-current={active === i}
            className="relative h-2.5 flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 rounded-full"
            style={{ width: active === i ? 34 : 10 }}
          >
            <span
              className="absolute inset-0 rounded-full"
              style={{ background: `${COLORS.terracotta}30` }}
            />
            {active === i && (
              <motion.span
                layoutId="indicator-pill"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-full"
                style={{ background: COLORS.gold }}
              />
            )}
          </button>
        ))}
      </div>
      <span
        className="text-[11px] tracking-[0.3em] uppercase"
        style={{ color: COLORS.terracotta, fontFamily: "Montserrat, sans-serif" }}
      >
        {String(active + 1).padStart(2, "0")}
        <span style={{ opacity: 0.5 }}> / {String(menus.length).padStart(2, "0")}</span>
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Fullscreen viewer — spring open/close, swipe between pages, pinch + wheel */
/*  + double-tap zoom, drag-to-pan while zoomed, drag-to-dismiss while not.   */
/* -------------------------------------------------------------------------- */
function MenuModal({ menus, active, onClose, onNext, onPrev }) {
  const current = menus[active];
  const closeBtnRef = useRef(null);
  const pinchRef = useRef({ active: false, startDist: 0, startScale: 1 });

  const scale = useMotionValue(1);
  const smoothScale = useSpring(scale, { stiffness: 260, damping: 26 });
  const dragY = useMotionValue(0);
  const backdropOpacity = useTransform(dragY, [-DISMISS_THRESHOLD * 2, 0, DISMISS_THRESHOLD * 2], [0.4, 1, 0.4]);

  const [isZoomed, setIsZoomed] = useState(false);

  useEffect(() => {
    closeBtnRef.current?.focus();
  }, []);

  useEffect(() => {
    scale.set(1);
    dragY.set(0);
    setIsZoomed(false);
  }, [active, scale, dragY]);

  const toggleZoom = useCallback(() => {
    const next = isZoomed ? 1 : DOUBLE_TAP_ZOOM;
    scale.set(next);
    setIsZoomed(!isZoomed);
  }, [isZoomed, scale]);

  const handleWheel = (e) => {
    if (!e.ctrlKey && Math.abs(e.deltaY) < 2) return;
    e.preventDefault();
    const next = Math.min(MAX_ZOOM, Math.max(1, scale.get() - e.deltaY * 0.01));
    scale.set(next);
    setIsZoomed(next > 1.02);
  };

  const dist = (touches) => {
    const [a, b] = touches;
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };

  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      pinchRef.current = { active: true, startDist: dist(e.touches), startScale: scale.get() };
    }
  };
  const handleTouchMove = (e) => {
    if (pinchRef.current.active && e.touches.length === 2) {
      e.preventDefault();
      const ratio = dist(e.touches) / pinchRef.current.startDist;
      const next = Math.min(MAX_ZOOM, Math.max(1, pinchRef.current.startScale * ratio));
      scale.set(next);
      setIsZoomed(next > 1.02);
    }
  };
  const handleTouchEnd = (e) => {
    if (e.touches.length < 2) pinchRef.current.active = false;
  };

  const handleDragEnd = (_, info) => {
    if (isZoomed) return;
    if (Math.abs(info.offset.y) > DISMISS_THRESHOLD || Math.abs(info.velocity.y) > 800) {
      onClose();
      return;
    }
    if (!info.offset.y) {
      if (info.offset.x < -SWIPE_THRESHOLD) onNext();
      else if (info.offset.x > SWIPE_THRESHOLD) onPrev();
    }
    dragY.set(0);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onNext();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "+" || e.key === "=") scale.set(Math.min(MAX_ZOOM, scale.get() + 0.3));
      if (e.key === "-") scale.set(Math.max(1, scale.get() - 0.3));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onNext, onPrev, scale]);

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={`${current.title} menu, full screen`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: `${COLORS.ink}F2`, backdropFilter: "blur(18px)", opacity: backdropOpacity }}
      onClick={onClose}
    >
      <MagneticIconButton onClick={onClose} label="Close zoom" size={44} tone="dark">
        <X size={20} color={COLORS.cream} />
      </MagneticIconButton>
      <div ref={closeBtnRef} tabIndex={-1} className="sr-only" />

      <motion.div
        className="absolute top-5 left-1/2 -translate-x-1/2 flex gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        {menus.map((m, i) => (
          <span
            key={m.title}
            className="h-1 rounded-full transition-all duration-300"
            style={{
              width: i === active ? 22 : 8,
              background: i === active ? COLORS.gold : `${COLORS.cream}40`,
            }}
          />
        ))}
      </motion.div>

      <AnimatePresence mode="wait" custom={0}>
        <motion.img
          key={active}
          src={current.image}
          alt={`${current.title} menu, zoomed`}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => {
            e.stopPropagation();
            toggleZoom();
          }}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
          drag
          style={{ scale: smoothScale, y: isZoomed ? undefined : dragY, touchAction: "none" }}
          dragElastic={isZoomed ? 0.05 : 0.6}
          dragMomentum={isZoomed}
          onDragEnd={handleDragEnd}
          draggable={false}
          className="max-h-[86vh] max-w-[92vw] object-contain rounded-2xl cursor-grab active:cursor-grabbing select-none"
        />
      </AnimatePresence>

      <div
        className="absolute bottom-24 sm:bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <MagneticIconButton
          onClick={() => scale.set(Math.max(1, scale.get() - 0.4))}
          label="Zoom out"
          size={38}
          tone="dark"
        >
          <Minus size={15} color={COLORS.cream} />
        </MagneticIconButton>
        <MagneticIconButton onClick={onPrev} label="Previous menu" size={44} tone="dark">
          <ChevronLeft size={18} color={COLORS.cream} />
        </MagneticIconButton>
        <MagneticIconButton onClick={onNext} label="Next menu" size={44} tone="dark">
          <ChevronRight size={18} color={COLORS.cream} />
        </MagneticIconButton>
        <MagneticIconButton
          onClick={() => scale.set(Math.min(MAX_ZOOM, scale.get() + 0.4))}
          label="Zoom in"
          size={38}
          tone="dark"
        >
          <Plus size={15} color={COLORS.cream} />
        </MagneticIconButton>
      </div>

      <p
        className="absolute bottom-6 sm:hidden left-1/2 -translate-x-1/2 text-[11px] tracking-widest uppercase"
        style={{ color: `${COLORS.cream}90`, fontFamily: "Montserrat, sans-serif" }}
      >
        Pinch or double-tap to zoom • Swipe to browse
      </p>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main gallery                                                              */
/* -------------------------------------------------------------------------- */
export default function PremiumMenuGallery() {
  const [active, setActive] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [direction, setDirection] = useState(0);
  const dragX = useMotionValue(0);
  const containerRef = useRef(null);
  const cardRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();

  // Cursor-tilt + parallax (desktop only)
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const springX = useSpring(tiltX, { stiffness: 150, damping: 18 });
  const springY = useSpring(tiltY, { stiffness: 150, damping: 18 });
  const rotateX = useTransform(springY, [-0.5, 0.5], [8, -8]);
  const rotateY = useTransform(springX, [-0.5, 0.5], [-8, 8]);
  const glowX = useTransform(springX, [-0.5, 0.5], ["20%", "80%"]);
  const glowY = useTransform(springY, [-0.5, 0.5], ["20%", "80%"]);
  const parallaxX = useTransform(springX, [-0.5, 0.5], [10, -10]);
  const parallaxY = useTransform(springY, [-0.5, 0.5], [10, -10]);
  const glowBackground = useTransform([glowX, glowY], ([gx, gy]) => `radial-gradient(circle at ${gx} ${gy}, ${COLORS.cream}22, transparent 55%)`);

  const handleMouseMove = (e) => {
    if (!cardRef.current || prefersReducedMotion) return;
    const rect = cardRef.current.getBoundingClientRect();
    tiltX.set((e.clientX - rect.left) / rect.width - 0.5);
    tiltY.set((e.clientY - rect.top) / rect.height - 0.5);
  };
  const resetTilt = () => {
    tiltX.set(0);
    tiltY.set(0);
  };

  const go = useCallback((i) => {
    setDirection(i > active ? 1 : -1);
    setActive((prev) => {
      const total = menus.length;
      const target = ((i % total) + total) % total;
      setDirection(target > prev || (prev === total - 1 && target === 0) ? 1 : -1);
      return target;
    });
  }, [active]);
  const prev = useCallback(() => go(active - 1), [active, go]);
  const next = useCallback(() => go(active + 1), [active, go]);

  useEffect(() => {
    if (zoomed) return;
    const onKey = (e) => {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "Enter") setZoomed(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed, next, prev]);

  const handleDragEnd = (_, info) => {
    if (info.offset.x < -SWIPE_THRESHOLD || info.velocity.x < -500) next();
    else if (info.offset.x > SWIPE_THRESHOLD || info.velocity.x > 500) prev();
    dragX.set(0);
  };

  const current = menus[active];

  return (
    <section
      className="relative overflow-hidden py-16 sm:py-24 lg:py-32 px-4"
      style={{
        backgroundImage: `linear-gradient(180deg, ${COLORS.cream}f0 0%, ${COLORS.creamDeep}f0 100%), url(${bgTexture})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundBlendMode: "soft-light",
      }}
    >
      {/* Ambient sunburst-yellow glow, echoing the signboard backdrop */}
      {!prefersReducedMotion && (
        <motion.div
          aria-hidden
          animate={{ scale: [1, 1.2, 1], opacity: [0.15, 0.28, 0.15] }}
          transition={{ repeat: Infinity, duration: 12, ease: "easeInOut" }}
          className="absolute w-[600px] h-[600px] rounded-full blur-[160px] left-1/2 top-0 -translate-x-1/2"
          style={{ background: COLORS.yellow }}
        />
      )}

      <div className="relative z-10 max-w-6xl mx-auto">
        {/* Brand header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center text-center mb-10 sm:mb-14"
        >
          <img src={logo} alt="New Vatika Café" className="h-50 sm:h-20 w-auto object-contain mb-4" />
          <p
            className="text-[40px] sm:text-l tracking-[0.4em] uppercase mb-3"
            style={{ color: COLORS.cream, fontFamily: "Poppins, sans-serif", fontWeight: 600 }}
          >
            The Menu Card
          </p>
          <AnimatePresence mode="wait" custom={direction}>
            <motion.h2
              key={current.title}
              custom={direction}
              variants={titleVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="text-3xl sm:text-5xl lg:text-6xl 2xl:text-7xl tracking-tight"
              style={{ fontFamily: "Poppins, sans-serif", color: COLORS.ink, fontWeight: 700 }}
            >
              {current.title}
            </motion.h2>
          </AnimatePresence>
          <AnimatePresence mode="wait">
            <motion.p
              key={current.subtitle}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.35, delay: 0.05 }}
              className="mt-3 text-sm sm:text-base tracking-wide"
              style={{ color: COLORS.cream, fontFamily: "Montserrat, sans-serif" }}
            >
              {current.subtitle}
            </motion.p>
          </AnimatePresence>
        </motion.div>

        {/* Card stage */}
        <div
          ref={containerRef}
          className="relative mx-auto h-[62vh] max-h-[680px] sm:h-[74vh] sm:max-h-[760px] 2xl:max-h-[860px] w-full flex items-center justify-center touch-pan-y"
          style={{ perspective: 1400 }}
        >
          {/* Depth layer: same image, blurred + scaled, sitting behind the card for ambient lighting */}
          <AnimatePresence>
            <motion.div
              key={`glow-${active}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
              aria-hidden
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <img
                src={current.image}
                alt=""
                aria-hidden
                className="w-[70%] h-[70%] object-cover blur-[90px] scale-110 opacity-60"
              />
            </motion.div>
          </AnimatePresence>

          <AnimatePresence initial={false} custom={direction} mode="popLayout">
            <motion.div
              key={active}
              custom={direction}
              variants={wipeVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.55, ease: [0.65, 0, 0.35, 1] }}
              drag="x"
              dragElastic={0.15}
              dragConstraints={{ left: 0, right: 0 }}
              onDragEnd={handleDragEnd}
              style={{ x: dragX }}
              className="absolute w-[88vw] max-w-[420px] sm:w-[500px] sm:max-w-[560px] lg:max-w-[600px] cursor-grab active:cursor-grabbing"
            >
              {/* Animated conic-gradient border ring, sitting just behind the card */}
              {!prefersReducedMotion && (
                <motion.div
                  aria-hidden
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 14, ease: "linear" }}
                  className="absolute -inset-[2px] rounded-[30px] opacity-70 pointer-events-none"
                  style={{
                    background: `conic-gradient(from 0deg, ${COLORS.gold}, transparent 30%, ${COLORS.terracotta}, transparent 70%, ${COLORS.gold})`,
                    filter: "blur(2px)",
                  }}
                />
              )}

              <motion.div
                ref={cardRef}
                onMouseMove={handleMouseMove}
                onMouseLeave={resetTilt}
                style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
                className="relative rounded-[28px] overflow-hidden bg-white"
              >
                <div
                  className="relative"
                  style={{
                    boxShadow: `0 40px 90px ${COLORS.ink}45, 0 4px 18px ${COLORS.ink}30`,
                    border: `1px solid ${COLORS.terracotta}33`,
                    borderRadius: 28,
                    overflow: "hidden",
                  }}
                >
                  <motion.img
                    src={current.image}
                    alt={`${current.title} menu card`}
                    loading="eager"
                    decoding="async"
                    animate={
                      prefersReducedMotion
                        ? undefined
                        : { scale: [1, 1.05, 1] }
                    }
                    transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
                    style={{ x: parallaxX, y: parallaxY }}
                    className="w-full h-[62vh] max-h-[640px] sm:max-h-[720px] object-cover object-top select-none pointer-events-none block"
                    draggable={false}
                  />

                  {!prefersReducedMotion && (
                    <motion.div
                      aria-hidden
                      className="hidden sm:block absolute inset-0 pointer-events-none"
                      style={{ background: glowBackground }}
                    />
                  )}

                  {/* Glass label bar */}
                  <div
                    className="absolute bottom-0 left-0 right-0 px-5 sm:px-6 py-4 flex items-center justify-between backdrop-blur-md"
                    style={{ background: `linear-gradient(180deg, transparent, ${COLORS.ink}E0)` }}
                  >
                    <span
                      className="text-sm sm:text-base tracking-wide"
                      style={{ color: COLORS.cream, fontFamily: "Montserrat, sans-serif", fontWeight: 500 }}
                    >
                      {String(active + 1).padStart(2, "0")} / {String(menus.length).padStart(2, "0")}
                    </span>
                    <motion.button
                      onClick={() => setZoomed(true)}
                      aria-label="View full-screen menu"
                      whileTap={{ scale: 0.9 }}
                      whileHover={{ scale: 1.06 }}
                      className="h-11 pl-4 pr-5 rounded-full flex items-center gap-2 backdrop-blur-md focus:outline-none focus-visible:ring-2"
                      style={{ background: `${COLORS.gold}30`, border: `1px solid ${COLORS.gold}70` }}
                    >
                      <ZoomIn size={16} color={COLORS.cream} />
                      <span
                        className="text-xs tracking-wide"
                        style={{ color: COLORS.cream, fontFamily: "Montserrat, sans-serif" }}
                      >
                        View full menu
                      </span>
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </div>

        <p
          className="sm:hidden text-center text-xs mt-4"
          style={{ color: COLORS.terracotta, fontFamily: "Montserrat, sans-serif" }}
        >
          Swipe to browse • Tap card to zoom
        </p>

        {/* Controls */}
        <div className="hidden sm:flex justify-center gap-6 mt-10">
          <MagneticIconButton onClick={prev} label="Previous menu">
            <ChevronLeft color={COLORS.ink} />
          </MagneticIconButton>
          <MagneticIconButton onClick={next} label="Next menu">
            <ChevronRight color={COLORS.ink} />
          </MagneticIconButton>
        </div>

        <ProgressIndicator menus={menus} active={active} onSelect={go} />
      </div>

      {/* Zoom modal */}
      <AnimatePresence>
        {zoomed && (
          <MenuModal
            menus={menus}
            active={active}
            onClose={() => setZoomed(false)}
            onNext={next}
            onPrev={prev}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
