import type { CSSProperties } from 'react';

/** SVG 문자열을 그대로 삽입하는 래퍼. 아트가 전부 코드 생성물이라 외부 입력이 없다. */
export function Svg({
  html, className, style,
}: { html: string; className?: string; style?: CSSProperties }) {
  return <div className={className} style={style} dangerouslySetInnerHTML={{ __html: html }} />;
}
