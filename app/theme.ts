export let isDarkMode = false;

export const setDarkMode = (value: boolean) => {
  isDarkMode = value;
};

export const lightTheme = {
  background: '#EEF3F9',
  card: '#FFFFFF',
  text: '#111827',
};

export const darkTheme = {
  background: '#111827',
  card: '#1F2937',
  text: '#FFFFFF',
};