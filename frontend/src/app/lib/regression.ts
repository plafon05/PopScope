export function linearRegression(xs: number[], ys: number[]) {
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumX2 = xs.reduce((acc, x) => acc + x * x, 0);
  const denom = n * sumX2 - sumX * sumX;

  if (denom === 0) {
    return (_x: number) => (n ? sumY / n : 0);
  }

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return (x: number) => slope * x + intercept;
}

export function computeRegressionMetrics(xs: number[], ys: number[]) {
  const predict = linearRegression(xs, ys);
  const preds = xs.map((x) => predict(x));
  const n = xs.length;
  if (n === 0) return { mae: 0, rmse: 0, mape: 0, sigma: 0 };

  const mae = ys.reduce((sum, y, index) => sum + Math.abs(y - preds[index]), 0) / n;
  const rmse = Math.sqrt(
    ys.reduce((sum, y, index) => sum + (y - preds[index]) ** 2, 0) / n,
  );
  const mape =
    (ys.reduce((sum, y, index) => sum + (y !== 0 ? Math.abs((y - preds[index]) / y) : 0), 0) /
      n) *
    100;
  const sigma = Math.sqrt(
    ys.reduce((sum, y, index) => sum + (y - preds[index]) ** 2, 0) /
      Math.max(1, n - 2),
  );

  return { mae, rmse, mape, sigma };
}
