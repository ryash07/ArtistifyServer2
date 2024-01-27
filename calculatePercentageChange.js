function calculateComparingPercentage(newValue, oldValue) {
  if (oldValue === null || oldValue === 0) {
    // If old value is null or 0, consider it as a 100% increase
    return newValue === 0 ? 0 : { direction: "up", percentageValue: 100 };
  }

  const percentageValue = (newValue - oldValue) / oldValue;

  return percentageValue > 0
    ? { direction: "up", percentageValue }
    : percentageValue < 0
    ? { direction: "down", percentageValue: Math.abs(percentageValue) }
    : { direction: "no-change", percentageValue };
}

module.exports = { calculateComparingPercentage };
