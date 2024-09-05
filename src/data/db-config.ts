import knex  from "knex";
import knexConfig  from "../../knexfile";

module.exports = knex(knexConfig[process.env.DB_ENV || "development"]);
