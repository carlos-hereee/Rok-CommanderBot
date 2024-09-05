import knex  from "knex";
import knexConfig  from "../../knexfile";

export { knex(knexConfig[process.env.DB_ENV || "development"]);}
