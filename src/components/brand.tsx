export function Boat({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M24 6v26M24 7L10 27h14M27 11l12 16H27"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinejoin="round"
      />
      <path d="M7 32h35l-7 8H16l-9-8Z" fill="currentColor" />
      <path
        d="M6 44c3-3 6 3 9 0s6 3 9 0 6 3 9 0 6 3 9 0"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}
export function RiverScene() {
  return (
    <svg
      className="river-scene"
      viewBox="0 0 380 220"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="280" cy="66" r="35" fill="#dce4bd" />
      <path
        d="M80 162C145 94 170 150 219 144S325 70 400 130v120H80Z"
        fill="#ccd9c4"
      />
      <path
        d="M-10 196C69 108 164 228 222 173s129-6 168 13v64H-10Z"
        fill="#b1c9b3"
      />
      <path d="M135 166c58 21 75 44 195 47" stroke="#e7edde" strokeWidth="16" />
      <path
        d="M264 104v51m0-48-25 35h25m6-29 24 29h-24"
        stroke="#54715e"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M232 156h69l-13 15h-43l-13-15Z" fill="#54715e" />
      <path
        d="M233 180c10-4 16 5 26 1s15 4 24 0 14 4 25 0"
        stroke="#86a18b"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M179 49c4-4 9-4 13 0 4-4 9-4 13 0m-47 25c3-3 6-3 9 0 3-3 6-3 9 0"
        stroke="#93a78c"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
