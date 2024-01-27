const formatSalesData = (salesData) => {
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const result = Array.from({ length: 5 }, (_, i) => ({
    monthName: monthNames[i],
    totalSales: 0,
  }));

  salesData.forEach((item) => {
    const index = item._id - 1;
    if (index < 5) {
      result[index] = {
        monthName: monthNames[index],
        totalSales: item.totalSales || 0,
      };
    }
  });

  return result;
};

module.exports = { formatSalesData };
