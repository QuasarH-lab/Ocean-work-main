window.__timelines = window.__timelines || {};
  const tl = gsap.timeline({ paused: true });

  function enter(selector, time) {
    const items = document.querySelectorAll(selector);
    tl.from(items, {
      opacity: 0,
      y: (i) => i % 3 === 0 ? 44 : (i % 3 === 1 ? 28 : 18),
      x: (i) => i % 4 === 0 ? -32 : 0,
      scale: (i) => i % 5 === 0 ? 0.96 : 1,
      duration: 0.68,
      stagger: 0.09,
      ease: "power3.out"
    }, time);
  }

  function pushTransition(fromId, toId, time, chapter) {
    const outgoing = "#" + fromId;
    const incoming = "#" + toId;
    tl.set(incoming, { opacity: 1, x: chapter ? 0 : 120, scale: chapter ? 1.025 : 1, filter: chapter ? "blur(10px)" : "blur(0px)", zIndex: 3 }, time);
    tl.set(outgoing, { zIndex: 2 }, time);
    tl.to(outgoing, { x: chapter ? -35 : -120, opacity: 0, scale: chapter ? 0.985 : 1, filter: chapter ? "blur(8px)" : "blur(0px)", duration: 0.65, ease: "power2.inOut" }, time);
    tl.to(incoming, { x: 0, opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.65, ease: "power3.out" }, time);
    tl.set(outgoing, { zIndex: 1 }, time + 0.66);
  }

  enter(".intro", 0.22);
  pushTransition("scene1", "scene2", 19.35, false); enter(".s2", 20.12);
  pushTransition("scene2", "scene3", 49.35, true); enter(".s3", 50.12);
  pushTransition("scene3", "scene4", 89.35, false); enter(".s4", 90.12);
  pushTransition("scene4", "scene5", 114.35, true); enter(".s5", 115.12);
  pushTransition("scene5", "scene6", 139.35, false); enter(".s6", 140.12);
  pushTransition("scene6", "scene7", 199.35, true); enter(".s7", 200.12);
  pushTransition("scene7", "scene8", 234.35, false); enter(".s8", 235.12);
  pushTransition("scene8", "scene9", 259.35, false); enter(".s9", 260.12);
  pushTransition("scene9", "scene10", 284.35, true); enter(".s10", 285.12);

  tl.to("#scene10 .s10", { opacity: 0, y: -18, duration: 0.9, stagger: 0.07, ease: "power2.in" }, 298.5);
  tl.to("#scene10", { backgroundColor: "#EEF3F7", duration: 1.2, ease: "sine.inOut" }, 298.5);

  gsap.to(".orb.a", { scale: 1.06, x: -18, duration: 7, yoyo: true, repeat: 42, ease: "sine.inOut" });
  gsap.to(".orb.b", { scale: 0.94, x: 16, duration: 6, yoyo: true, repeat: 49, ease: "sine.inOut" });

  window.__timelines["main"] = tl;