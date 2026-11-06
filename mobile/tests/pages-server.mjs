import express from 'express';
const app=express();app.use('/Computo_Scientifico_test',express.static('dist'));app.listen(4174,'127.0.0.1');
