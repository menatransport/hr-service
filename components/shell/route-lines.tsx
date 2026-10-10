/**
 * ลายเส้นถนนประกับหมุดทอง — ลายเซ็นของพื้นหลัง “Night Route” (ฮีโร่ Home + พื้นเชลล์หน้าใน)
 * ภาพตกแต่งล้วน (`aria-hidden`) · การเคลื่อนไหวหยุดเองเมื่อผู้ใช้ตั้งลดการเคลื่อนไหว
 */
export function RouteLines({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1440 560"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      className={`pointer-events-none size-full ${className}`}
    >
      <path
        d="M-40 470 C 220 380, 360 520, 600 430 S 980 250, 1180 300 S 1420 210, 1500 160"
        fill="none"
        stroke="rgba(255,255,255,.06)"
        strokeWidth="34"
        strokeLinecap="round"
      />
      <path
        className="home-route-dash"
        d="M-40 470 C 220 380, 360 520, 600 430 S 980 250, 1180 300 S 1420 210, 1500 160"
        fill="none"
        stroke="rgba(255,255,255,.32)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M-60 170 C 160 230, 330 90, 560 150 S 900 300, 1120 180"
        fill="none"
        stroke="rgba(255,255,255,.14)"
        strokeWidth="1.6"
        strokeDasharray="2 10"
        strokeLinecap="round"
      />
      <path
        d="M860 560 C 900 450, 1040 420, 1080 330 S 1240 170, 1460 120"
        fill="none"
        stroke="rgba(252,211,141,.28)"
        strokeWidth="1.6"
        strokeDasharray="2 10"
        strokeLinecap="round"
      />
      <circle cx="600" cy="430" r="5" fill="#fcd38d" />
      <circle className="home-pin" cx="600" cy="430" r="11" fill="none" stroke="#fcd38d" strokeWidth="1.5" />
      <circle cx="1180" cy="300" r="5" fill="#fcd38d" />
      <circle
        className="home-pin [animation-delay:.8s]"
        cx="1180"
        cy="300"
        r="11"
        fill="none"
        stroke="#fcd38d"
        strokeWidth="1.5"
      />
      <circle cx="560" cy="150" r="4" fill="#7ae8d3" />
      <circle
        className="home-pin [animation-delay:1.6s]"
        cx="560"
        cy="150"
        r="10"
        fill="none"
        stroke="#7ae8d3"
        strokeWidth="1.5"
      />
    </svg>
  );
}
