import knex  from "knex";
import knexConfig  from "../../knexfile";
import {dbEnv} from '@utils/config'

export = knex(knexConfig[dbEnv])
