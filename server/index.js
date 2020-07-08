const keys = require('./keys');

// Express App Setup - all libraries it needs
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
//create new express app objet which receive and responds to any
//htttp request that are coming and go back from the react app
app.use(cors());
//uses cors and body parser;
// cors: cross domains: allow us making req from one domain where our react app runs to completely diff domain from other port where express API is hosted on
app.use(bodyParser.json());
//parse incoming req from the react app and return the body of the POST request into json that our express API can easy work with it

// Postgres Client Setup: express app to communicate woth postgress db
//{Pool module}
const { Pool } = require('pg');
//create the pgClient from the Pool object
const pgClient = new Pool({
  user: keys.pgUser,
  host: keys.pgHost,
  database: keys.pgDatabase,
  password: keys.pgPassword,
  port: keys.pgPort,
});

pgClient.on('connect', () => {
  pgClient
    .query('CREATE TABLE IF NOT EXISTS values (number INT)')
    .catch((err) => console.log(err));
});

// Redis Client Setup: connect to redis from Express API; express API wiil push the index to redis
const redis = require('redis');
const redisClient = redis.createClient({
  host: keys.redisHost,
  port: keys.redisPort,
  retry_strategy: () => 1000,
});
//duplicate connection - dedicated connection for each aspect: publish/subscribe-listen, cannot do anything else
const redisPublisher = redisClient.duplicate();

// Express route handlers

//route test handler
//the root route / - test route to use that the appo is working the way we expect
app.get('/', (req, res) => {
  res.send('Hi');
});

//route handler - async to query our postgress client for all submitted values
app.get('/values/all', async (req, res) => {
  const values = await pgClient.query('SELECT * from values');
 //async await syntax - promise support
  res.send(values.rows);
});
//get request handler - async get all values ever been calculated till now; h will look at 'values'
//redis has no promise support for node js - uses callbacks only
app.get('/values/current', async (req, res) => {
  redisClient.hgetall('values', (err, values) => {
    res.send(values);
  });
});

//when users put an index and submit handler, for /values end point
app.post('/values', async (req, res) => {
  const index = req.body.index;

  if (parseInt(index) > 40) {
    //for values more>40 our method will take years
    return res.status(422).send('Index too high');
  }

  redisClient.hset('values', index, 'Nothing yet!');
  //will send a meesage to the worker process which wil l wake up our worker process
  redisPublisher.publish('insert', index);
  pgClient.query('INSERT INTO values(number) VALUES($1)', [index]);

  //send back some arbitrary response
  res.send({ working: true });
});

//we will listen to port 5000 inside in here
app.listen(5000, (err) => {
  console.log('Listening');
});
