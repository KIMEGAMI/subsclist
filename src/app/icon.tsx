export default function Icon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="none">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#2563eb" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <rect width="256" height="256" rx="56" fill="url(#bg)" />
      <rect x="58" y="50" width="140" height="156" rx="28" fill="#ffffff" />
      <path d="M82 96l16 16 28-30" stroke="#2563eb" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M82 140l16 16 28-30" stroke="#2563eb" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M82 184l16 16 28-30" stroke="#2563eb" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="122" y="94" width="66" height="14" rx="7" fill="#bfdbfe" />
      <rect x="122" y="138" width="66" height="14" rx="7" fill="#bfdbfe" />
      <rect x="122" y="182" width="66" height="14" rx="7" fill="#bfdbfe" />
    </svg>
  );
}
