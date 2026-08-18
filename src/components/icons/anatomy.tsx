import type { ReactElement, ReactNode, SVGProps } from "react";

export type AnatomyIcon = (props: SVGProps<SVGSVGElement>) => ReactElement;

const svgBase = (props: SVGProps<SVGSVGElement>) => ({
  viewBox: "0 0 48 48",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...props,
});

/** Pain / focus marks: short radiating strokes around a point. */
function Spark({ x, y, flip = false }: { x: number; y: number; flip?: boolean }) {
  const s = flip ? -1 : 1;
  return (
    <g strokeWidth="1.4">
      <path d={`M${x} ${y} l${s * 3.4} -1`} />
      <path d={`M${x} ${y + 3} l${s * 3.4} .6`} />
      <path d={`M${x + s * 0.6} ${y - 3} l${s * 2.4} -2.4`} />
    </g>
  );
}

/** Dashed guideline (posture / axis). */
function Axis({ d }: { d: string }) {
  return <path d={d} strokeDasharray="1.6 3" strokeWidth="1.4" />;
}

/** Human figure seen from the back, torso + arms. */
function BackFigure({ children }: { children?: ReactNode }) {
  return (
    <g>
      <circle cx="24" cy="10.5" r="5.2" />
      <path d="M24 16.4c-3.6 0-6.6 1.1-8.8 3.3-2.4 2.4-3.6 5.8-3.9 10-.2 3.4.2 6.7 1.3 9.9" />
      <path d="M24 16.4c3.6 0 6.6 1.1 8.8 3.3 2.4 2.4 3.6 5.8 3.9 10 .2 3.4-.2 6.7-1.3 9.9" />
      <path d="M18.6 20.4c-.9 5.4-1.2 11-.9 16.6M29.4 20.4c.9 5.4 1.2 11 .9 16.6" />
      {children}
    </g>
  );
}

/** Back & neck pain — figure with spine axis and pain marks at the shoulder. */
export const SpineIcon: AnatomyIcon = (p) => (
  <svg {...svgBase(p)}>
    <BackFigure>
      <Axis d="M24 17.5c-.6 6-.6 12 0 19" />
    </BackFigure>
    <Spark x={35.5} y={17.5} />
    <Spark x={12.5} y={17.5} flip />
  </svg>
);

/** Neck / cervical — marks near the neck. */
export const NeckIcon: AnatomyIcon = (p) => (
  <svg {...svgBase(p)}>
    <BackFigure>
      <Axis d="M24 17.5c-.6 5-.6 10 0 15" />
      <path d="M21 16.8c1.9.9 4.1.9 6 0" strokeWidth="1.4" />
    </BackFigure>
    <Spark x={31.5} y={9.5} />
    <Spark x={16.5} y={9.5} flip />
  </svg>
);

/** Joint pain — figure with hands on the lower back. */
export const HipIcon: AnatomyIcon = (p) => (
  <svg {...svgBase(p)}>
    <BackFigure>
      <Axis d="M24 18c-.6 6-.6 12 0 18" />
      <path d="M14.4 27.5c1.9 1.4 3.6 2.6 5.4 3.2M33.6 27.5c-1.9 1.4-3.6 2.6-5.4 3.2" strokeWidth="1.4" />
    </BackFigure>
    <Spark x={36.5} y={29} />
    <Spark x={11.5} y={29} flip />
  </svg>
);

/** Shoulder — figure with marks over one shoulder. */
export const ShoulderIcon: AnatomyIcon = (p) => (
  <svg {...svgBase(p)}>
    <BackFigure>
      <Axis d="M24 18c-.6 6-.6 11 0 16" />
    </BackFigure>
    <circle cx="32.4" cy="21" r="3.4" strokeWidth="1.4" strokeDasharray="1.6 2.6" />
    <Spark x={38} y={20} />
  </svg>
);

/** Knee joint (femur, patella, tibia) with pain marks. */
export const KneeIcon: AnatomyIcon = (p) => (
  <svg {...svgBase(p)}>
    <path d="M17 5v10.6c0 2.2-1.4 3.6-1.4 6 0 3.4 3 5.6 6.6 5.6" />
    <path d="M30 5v10.6c0 2.6 1.6 4 1.6 6.4 0 3.2-2.6 5.2-6 5.2" />
    <path d="M15.8 21.8c1.8 1.8 4.4 2.8 6.6 2.8" />
    <circle cx="12.6" cy="21.6" r="3.6" strokeWidth="1.5" />
    <path d="M18 27.6c-.8 2.6-1.2 4.8-1.2 7V44M29.2 27.4c.8 2.6 1.2 4.8 1.2 7V44" />
    <Spark x={35} y={20} />
    <Spark x={6} y={28} flip />
  </svg>
);

/** Hand / wrist */
export const HandIcon: AnatomyIcon = (p) => (
  <svg {...svgBase(p)}>
    <path d="M19 24V9.5a2.6 2.6 0 1 1 5.2 0V22" />
    <path d="M24.2 21V7.5a2.6 2.6 0 1 1 5.2 0V22" />
    <path d="M29.4 22V10a2.6 2.6 0 1 1 5.2 0v18c0 8-5.2 13-12 13s-11-4.6-11-11V21a2.6 2.6 0 0 1 5.2 0v5" />
    <Spark x={38} y={28} />
  </svg>
);

/** Foot / gait */
export const FootIcon: AnatomyIcon = (p) => (
  <svg {...svgBase(p)}>
    <path d="M17 6c-2.6 0-4.4 2-4.4 5 0 4-.6 7-2.2 10.4C8.6 25.4 7 28.4 7 32c0 5.6 4.4 9 11 9h18c3 0 4.6-1.6 4.6-3.6 0-2.4-2-3.6-5.4-4.4l-9.4-2.2c-3-.7-4.4-2.2-4.4-5V11c0-3-1.6-5-4.4-5Z" />
    <Axis d="M14.6 12v18" />
    <Spark x={38} y={20} />
  </svg>
);

/** Post-op rehab — knee with recovery arrow */
export const RehabIcon: AnatomyIcon = (p) => (
  <svg {...svgBase(p)}>
    <path d="M16 6v10.4c0 2.2-1.4 3.6-1.4 6 0 3.4 3 5.6 6.6 5.6" />
    <path d="M28 6v10.6c0 2.6 1.6 4 1.6 6.4 0 3.2-2.6 5.2-6 5.2" />
    <path d="M14.8 21.6c1.8 1.8 4.4 2.8 6.6 2.8" />
    <path d="M17 28.4c-.8 2.6-1.2 4.8-1.2 7V44M27.2 28.2c.8 2.6 1.2 4.8 1.2 7V44" />
    <path d="M36 14a10 10 0 1 1-3.6 16" strokeDasharray="2.4 2.6" strokeWidth="1.5" />
    <path d="M36 14h-4.6M36 14v4.6" strokeWidth="1.5" />
  </svg>
);

/** Manual therapy / massage — hands on a reclining back */
export const MassageIcon: AnatomyIcon = (p) => (
  <svg {...svgBase(p)}>
    <path d="M4 39c3.4-6.4 10.6-10.4 20-10.4S40.6 32.6 44 39" />
    <circle cx="9.6" cy="30.4" r="3.4" />
    <path d="M17.6 25.4V15a2.4 2.4 0 0 1 4.8 0v6.4M22.4 21.4v-8.6a2.4 2.4 0 0 1 4.8 0v8.8M27.2 21.8v-6.6a2.3 2.3 0 0 1 4.6 0v9.2" />
    <path d="M31.8 24.4v-3.8a2.3 2.3 0 0 1 4.6 0v5.6" strokeWidth="1.5" />
  </svg>
);

/** Sports / strengthening — figure lifting */
export const MuscleIcon: AnatomyIcon = (p) => (
  <svg {...svgBase(p)}>
    <circle cx="24" cy="9.5" r="4.6" />
    <path d="M24 14.4v13" />
    <path d="M24 18.4l-7 -4.6M24 18.4l7 -4.6" />
    <path d="M24 27.4l-5 7.6V44M24 27.4l5 7.6V44" />
    <path d="M14 9.4v8.8M10.6 11.4v4.8M33.6 9.4v8.8M37 11.4v4.8" strokeWidth="1.5" />
    <path d="M14 13.8h20" strokeWidth="1.5" />
  </svg>
);

/** Neuro — head with brain folds */
export const BrainIcon: AnatomyIcon = (p) => (
  <svg {...svgBase(p)}>
    <path d="M28 42c-.4-4 .4-6 2.2-8.4 3.4-4.4 5.8-7.6 5.8-12.6C36 12.6 30.4 7 22.8 7 15.6 7 10 12.4 10 19.6c0 4 1.6 6.6 4 8.6" />
    <path d="M14 28.2c1.6 1.4 2.4 3 2.4 5.4V42" />
    <path d="M17.6 15.6c2.2-2 5.4-2 7.6.2M18.4 23.4c2.6-.6 4.6.6 5.4 3M27.4 12.6c3 1 4.8 3.4 5 6.6" strokeWidth="1.4" />
    <Spark x={39} y={13} />
  </svg>
);

/** Electrotherapy / nerve stimulation */
export const NerveIcon: AnatomyIcon = (p) => (
  <svg {...svgBase(p)}>
    <path d="M5 26h7.6l4-9 5.4 20 4.4-13 3 8 3.6-6H43" />
    <path d="M33 5l-4.4 8.4h5.4L30 21" strokeWidth="1.5" />
  </svg>
);

/** Hydrotherapy */
export const WaterIcon: AnatomyIcon = (p) => (
  <svg {...svgBase(p)}>
    <path d="M24 5c5.5 6.5 9 11.5 9 16.4C33 27.8 29 32 24 32s-9-4.2-9-10.6C15 16.5 18.5 11.5 24 5Z" />
    <path d="M5 38c3-2.4 6-2.4 9 0s6 2.4 9 0 6-2.4 9 0 6 2.4 9 0" />
  </svg>
);

/** Heat / cold therapy */
export const ThermoIcon: AnatomyIcon = (p) => (
  <svg {...svgBase(p)}>
    <path d="M20 27.5V10a4 4 0 1 1 8 0v17.5a8 8 0 1 1-8 0Z" />
    <path d="M24 16v16" />
    <circle cx="24" cy="35" r="3" fill="currentColor" stroke="none" />
  </svg>
);

/** Respiratory */
export const LungsIcon: AnatomyIcon = (p) => (
  <svg {...svgBase(p)}>
    <path d="M24 6v18" />
    <path d="M24 15c-2.6 0-4.4-1.4-5.6-2.6M24 15c2.6 0 4.4-1.4 5.6-2.6" />
    <path d="M18.4 12.4c-1.6 1.4-2.6 3.6-3.6 7.6-1.2 4.6-3.4 8-5.4 10.4-1.4 1.7-1.6 4.2-.4 6.2 1.6 2.6 4.6 3.6 7.2 2.4 3-1.4 4.6-4 4.6-8V18c0-3.4-1-6.2-2.4-5.6Z" />
    <path d="M29.6 12.4c1.6 1.4 2.6 3.6 3.6 7.6 1.2 4.6 3.4 8 5.4 10.4 1.4 1.7 1.6 4.2.4 6.2-1.6 2.6-4.6 3.6-7.2 2.4-3-1.4-4.6-4-4.6-8V18c0-3.4 1-6.2 2.4-5.6Z" />
  </svg>
);

/** Mobility / stretching figure */
export const StretchIcon: AnatomyIcon = (p) => (
  <svg {...svgBase(p)}>
    <circle cx="26" cy="9" r="4.4" />
    <path d="M26 13.6c-1.4 4-2.4 7.6-3 11" />
    <path d="M25.6 17.6L17 13.8M25.4 18.4l9.4 3.6" />
    <path d="M23 24.6l-5.6 7.8L14 44M23 24.6l6.6 8.4 7.4 5.6" />
    <Axis d="M8 44h32" />
  </svg>
);

/** Assessment / consultation */
export const AssessIcon: AnatomyIcon = (p) => (
  <svg {...svgBase(p)}>
    <path d="M13 6v8a8 8 0 0 0 16 0V6" />
    <path d="M10 6h5M27 6h5" />
    <path d="M21 22v6c0 6 4.6 10 10 10s10-4 10-10v-3" />
    <circle cx="41" cy="19" r="4" />
  </svg>
);
