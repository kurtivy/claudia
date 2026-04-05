import {
  AbsoluteFill,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  Easing,
} from "remotion";

const CLIENTS = ["Ankr", "zkSync", "SKALE", "CoinsPaid", "Gamerse", "SHOPX", "PKT", "Liti Capital"];

// --- SLIDE 1: Logo + intro ---
const Slide1: React.FC<{ frame: number }> = ({ frame }) => {
  const logoScale = interpolate(frame, [0, 18], [0.3, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.back(1.4)),
  });
  const logoOpacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  const burstScale = interpolate(frame, [8, 25], [0, 2.5], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.ease),
  });
  const burstOpacity = interpolate(frame, [8, 25], [0.4, 0], { extrapolateRight: "clamp" });
  const titleOpacity = interpolate(frame, [18, 30], [0, 1], { extrapolateRight: "clamp" });
  const titleY = interpolate(frame, [18, 30], [30, 0], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.ease),
  });
  const tagOpacity = interpolate(frame, [28, 40], [0, 1], { extrapolateRight: "clamp" });

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", position: "relative" }}>
      <div style={{
        position: "absolute", width: 200, height: 200, borderRadius: "50%",
        border: "3px solid #b5382a", transform: `scale(${burstScale})`, opacity: burstOpacity,
        top: "50%", left: "50%", marginTop: -130, marginLeft: -100,
      }} />
      <Img src={staticFile("logo.png")} style={{
        width: 120, height: 120, opacity: logoOpacity, transform: `scale(${logoScale})`,
      }} />
      <div style={{
        color: "#1a1a1a", fontSize: 56, fontWeight: 800, marginTop: 16,
        opacity: titleOpacity, transform: `translateY(${titleY}px)`, letterSpacing: -1,
      }}>
        Web3 Advisory
      </div>
      <div style={{
        color: "#b5382a", fontSize: 22, fontWeight: 600, marginTop: 8,
        opacity: tagOpacity, letterSpacing: 2, textTransform: "uppercase",
      }}>
        Full-Stack Web3 Marketing & SaaS Products
      </div>
    </div>
  );
};

// --- Generic service slide ---
const ServiceSlide: React.FC<{
  frame: number; icon: string; label: string; desc: string; index: number;
}> = ({ frame, icon, label, desc, index }) => {
  const iconScale = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: "clamp", easing: Easing.out(Easing.back(1.8)),
  });
  const labelOpacity = interpolate(frame, [6, 18], [0, 1], { extrapolateRight: "clamp" });
  const labelX = interpolate(frame, [6, 18], [40, 0], {
    extrapolateRight: "clamp", easing: Easing.out(Easing.ease),
  });
  const descOpacity = interpolate(frame, [14, 24], [0, 1], { extrapolateRight: "clamp" });
  const barWidth = interpolate(frame, [10, 28], [0, 80], { extrapolateRight: "clamp" });
  const isEven = index % 2 === 0;

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: isEven ? "flex-start" : "flex-end",
      justifyContent: "center", height: "100%", padding: "60px 100px",
    }}>
      <span style={{ fontSize: 72, transform: `scale(${iconScale})`, display: "block", marginBottom: 16 }}>
        {icon}
      </span>
      <div style={{
        color: "#1a1a1a", fontSize: 44, fontWeight: 700,
        opacity: labelOpacity, transform: `translateX(${isEven ? labelX : -labelX}px)`,
        maxWidth: 800, textAlign: isEven ? "left" : "right",
      }}>
        {label}
      </div>
      <div style={{
        width: barWidth, height: 4, backgroundColor: "#b5382a",
        marginTop: 14, marginBottom: 14, borderRadius: 2,
        alignSelf: isEven ? "flex-start" : "flex-end",
      }} />
      <div style={{
        color: "#5a5550", fontSize: 26, fontWeight: 400, opacity: descOpacity,
        textAlign: isEven ? "left" : "right", maxWidth: 700, lineHeight: 1.4,
      }}>
        {desc}
      </div>
    </div>
  );
};

// --- Clients slide ---
const ClientsSlide: React.FC<{ frame: number }> = ({ frame }) => {
  const titleOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", height: "100%", padding: "60px 80px",
    }}>
      <div style={{
        color: "#5a5550", fontSize: 18, fontWeight: 600, letterSpacing: 3,
        textTransform: "uppercase", marginBottom: 32, opacity: titleOpacity,
      }}>
        Past Clients Include
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 24, maxWidth: 900 }}>
        {CLIENTS.map((client, i) => {
          const startFrame = 8 + i * 5;
          const opacity = interpolate(frame, [startFrame, startFrame + 10], [0, 1], {
            extrapolateRight: "clamp", extrapolateLeft: "clamp",
          });
          const scale = interpolate(frame, [startFrame, startFrame + 10], [0.8, 1], {
            extrapolateRight: "clamp", extrapolateLeft: "clamp",
            easing: Easing.out(Easing.ease),
          });
          return (
            <div key={i} style={{
              padding: "12px 28px", backgroundColor: "#ffffff",
              border: "2px solid #e0dcd6", borderRadius: 8,
              color: "#1a1a1a", fontSize: 22, fontWeight: 600,
              opacity, transform: `scale(${scale})`,
            }}>
              {client}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// --- SaaS transition slide ---
const SaaSIntroSlide: React.FC<{ frame: number }> = ({ frame }) => {
  const titleOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const titleY = interpolate(frame, [0, 15], [30, 0], {
    extrapolateRight: "clamp", easing: Easing.out(Easing.ease),
  });
  const subOpacity = interpolate(frame, [12, 25], [0, 1], { extrapolateRight: "clamp" });
  const barWidth = interpolate(frame, [8, 30], [0, 100], { extrapolateRight: "clamp" });

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", height: "100%",
    }}>
      <div style={{
        color: "#1a1a1a", fontSize: 48, fontWeight: 800,
        opacity: titleOpacity, transform: `translateY(${titleY}px)`,
        textAlign: "center",
      }}>
        Looking for powerful Web3 tools?
      </div>
      <div style={{
        width: barWidth, height: 4, backgroundColor: "#b5382a",
        marginTop: 20, marginBottom: 20, borderRadius: 2,
      }} />
      <div style={{
        color: "#b5382a", fontSize: 24, fontWeight: 600,
        opacity: subOpacity, letterSpacing: 2, textTransform: "uppercase",
      }}>
        Web3 Advisory SaaS Suite
      </div>
    </div>
  );
};

// --- CTA slide ---
const CTASlide: React.FC<{ frame: number }> = ({ frame }) => {
  const logoOpacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const textOpacity = interpolate(frame, [8, 20], [0, 1], { extrapolateRight: "clamp" });
  const btnScale = interpolate(frame, [15, 28], [0.8, 1], {
    extrapolateRight: "clamp", easing: Easing.out(Easing.back(1.4)),
  });
  const btnOpacity = interpolate(frame, [15, 28], [0, 1], { extrapolateRight: "clamp" });
  const pulse = interpolate(frame, [28, 40, 52], [1, 1.04, 1], { extrapolateRight: "extend" });

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", height: "100%",
    }}>
      <Img src={staticFile("logo.png")} style={{
        width: 80, height: 80, opacity: logoOpacity, marginBottom: 20,
      }} />
      <div style={{
        color: "#1a1a1a", fontSize: 42, fontWeight: 700,
        opacity: textOpacity, textAlign: "center",
      }}>
        Ready to grow?
      </div>
      <div style={{ color: "#5a5550", fontSize: 22, marginTop: 8, opacity: textOpacity, textAlign: "center" }}>
        Everything you need to launch in Web3
      </div>
      <div style={{
        marginTop: 32, padding: "16px 48px", backgroundColor: "#b5382a",
        borderRadius: 8, color: "#f5f2ed", fontSize: 24, fontWeight: 700,
        opacity: btnOpacity, transform: `scale(${btnScale * pulse})`,
      }}>
        DM or email contact@web3advisory.co
      </div>
    </div>
  );
};

// --- SLIDES CONFIG ---
const SLIDES = [
  { id: "logo", duration: 75 },        // 1: logo + intro (2.5s)
  { id: "growth", duration: 75 },       // 2: full stack growth & PR
  { id: "email", duration: 75 },        // 3: email campaigns
  { id: "clients", duration: 80 },      // 4: past clients
  { id: "saas-intro", duration: 75 },   // 5: SaaS transition
  { id: "token", duration: 75 },        // 6: token launch
  { id: "agent", duration: 75 },        // 7: AI agents
  { id: "telegram", duration: 75 },     // 8: telegram bot
  { id: "cta", duration: 75 },          // 9: CTA
];

export const W3AServices: React.FC = () => {
  const frame = useCurrentFrame();

  // Build slide boundaries with 8-frame crossfade overlap
  const OVERLAP = 8;
  const boundaries: { start: number; end: number; id: string }[] = [];
  let cursor = 0;
  for (const slide of SLIDES) {
    boundaries.push({ start: cursor, end: cursor + slide.duration, id: slide.id });
    cursor += slide.duration - OVERLAP;
  }

  // Find active slide
  let activeIdx = 0;
  for (let i = boundaries.length - 1; i >= 0; i--) {
    if (frame >= boundaries[i].start) {
      activeIdx = i;
      break;
    }
  }

  const s = boundaries[activeIdx];
  const slideFrame = frame - s.start;

  const fadeIn = interpolate(frame, [s.start, s.start + OVERLAP], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [s.end - OVERLAP, s.end], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const slideOpacity = Math.min(fadeIn, fadeOut);

  const renderSlide = () => {
    switch (s.id) {
      case "logo": return <Slide1 frame={slideFrame} />;
      case "growth": return <ServiceSlide frame={slideFrame} icon="📈" label="Full-Stack Growth & PR" desc="Press releases, KOL campaigns, social media management, business development, and partnerships" index={0} />;
      case "email": return <ServiceSlide frame={slideFrame} icon="📧" label="80,000+ Verified Buyer Email List" desc="Targeted campaigns that land in inboxes, not spam" index={1} />;
      case "clients": return <ClientsSlide frame={slideFrame} />;
      case "saas-intro": return <SaaSIntroSlide frame={slideFrame} />;
      case "token": return <ServiceSlide frame={slideFrame} icon="🪙" label="Token Launch & Management" desc="Bulk wallet and fund control, automated trading" index={0} />;
      case "agent": return <ServiceSlide frame={slideFrame} icon="🤖" label="Custom AI Agents" desc="Built to your workflow" index={1} />;
      case "telegram": return <ServiceSlide frame={slideFrame} icon="💬" label="Telegram Automation Tool" desc="Organize contacts, send or schedule bulk messages, account defense, and more" index={0} />;
      case "cta": return <CTASlide frame={slideFrame} />;
      default: return null;
    }
  };

  return (
    <AbsoluteFill style={{ backgroundColor: "#f5f2ed" }}>
      <div style={{
        position: "absolute", top: -100, right: -100, width: 400, height: 400,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(181,56,42,0.08) 0%, transparent 70%)",
      }} />
      <div style={{
        position: "absolute", bottom: -80, left: -80, width: 300, height: 300,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(181,56,42,0.05) 0%, transparent 70%)",
      }} />

      <AbsoluteFill style={{ opacity: slideOpacity }}>
        {renderSlide()}
      </AbsoluteFill>

      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        height: 4, backgroundColor: "#b5382a",
      }} />
    </AbsoluteFill>
  );
};
