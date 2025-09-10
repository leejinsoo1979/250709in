// Production에서 console 비활성화
export const disableConsole = () => {
  if (import.meta.env.PROD) {
    console.log = () => {};
    console.error = () => {};
    console.warn = () => {};
    console.info = () => {};
    console.debug = () => {};
  }
};

// Development에서만 console 활성화 (선택적)
export const disableAllConsole = () => {
  console.log = () => {};
  console.error = () => {};
  console.warn = () => {};
  console.info = () => {};
  console.debug = () => {};
};