export const isPresent = <T>(value: T | undefined): value is T => {
  return value !== undefined && value !== null;
};

export const isAbsent = <T>(value: T | undefined): value is undefined => {
  return value === undefined || value === null;
};
