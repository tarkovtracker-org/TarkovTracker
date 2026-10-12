// Embeds a value in evaluated source; escapes characters that could end a string or script context.
export const literal = (value) =>
  JSON.stringify(value).replace(
    /[<>/\b\f\n\r\t\0\u2028\u2029]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
