const { calculatePayroll } = require('./people.js');
console.log(JSON.stringify(calculatePayroll(90000, 3)));
console.log(JSON.stringify(calculatePayroll(90000, 3, 31)));
