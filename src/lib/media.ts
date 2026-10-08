import { url, type Media } from './content';

// A small rendition is optional. Without one, the original image works normally.
export const mediaSrcSet = (media: Media) => media.srcSmall && media.widthSmall && media.widthSmall !== media.width
  ? `${url(media.srcSmall)} ${media.widthSmall}w, ${url(media.src)} ${media.width}w`
  : undefined;
export const mediaPreview = (media: Media) => url(media.srcSmall || media.src);
