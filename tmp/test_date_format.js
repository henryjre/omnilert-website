
const date = new Date('2026-04-01T12:00:00Z');
const formattedDate = new Intl.DateTimeFormat("en-CA", { 
  timeZone: "Asia/Manila", 
  year: "numeric", 
  month: "2-digit", 
  day: "2-digit" 
}).format(date);
console.log(formattedDate);
