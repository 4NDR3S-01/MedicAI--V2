/** Se carga antes de cada archivo de pruebas (ver "test" en package.json). */
import 'reflect-metadata';

import { Logger } from '@nestjs/common';

// Los registros del servidor solo ensucian la salida de las pruebas.
Logger.overrideLogger(false);
