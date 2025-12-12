export const VIDEO_ASPECT_RATIO_OPTIONS = ['16:9', '9:16', '1:1', '4:3'] as const;

export type VideoAspectRatio = (typeof VIDEO_ASPECT_RATIO_OPTIONS)[number];
