/** ข้อความคู่มือ — `**คำ**` เป็นตัวหนา (ที่เดียวที่เนื้อหาคู่มือมีรูปแบบ) */
export function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split("**").map((part, i) =>
        i % 2 ? (
          <b key={i} className="font-semibold text-ink">
            {part}
          </b>
        ) : (
          part
        ),
      )}
    </>
  );
}
