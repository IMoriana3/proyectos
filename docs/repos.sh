#!/usr/bin/env bash
#
# LA LISTA DE REPOS DE LA SUITE, EN UN SOLO SITIO.
#
# La tenían `ci_al_dia.sh` y la iba a tener `al_empezar.sh`. Dos listas es una
# lista que se queda vieja: el día que se añada un repo y sólo se toque una, el
# otro guardia deja de mirarlo y NADIE SE ENTERA — que es exactamente el modo de
# fallo que los dos vienen a cerrar.
#
# ESCRITA A MANO A PROPÓSITO. Una lista sacada de la API traería repos que no son
# de esta suite y escondería el día que uno deje de estar. Por eso los dos que la
# usan publican su ALCANCE: cuántos repos declarados y cuántos han podido mirar.
#
#   source "$(dirname "$0")/repos.sh"
#
REPOS=(
  proyectos siting cobertura-zigbee scada gemelo-digital
  visores checklist-solar-v2 gorraiz-dashboard solargptfull
  factiun-cartera cobertura-rf-fv
)
# `visores` se llamaba `visor-san-jose`. El nombre viejo responde 301 y GitHub
# redirige a `/repositories/{id}`, que el proxy de estas sesiones no deja pasar:
# o sea que con el nombre viejo el repo salía como «NO MIRADO» y un CI en rojo
# podía esconderse ahí. Queda escrito para que nadie lo vuelva a poner.

# MEDIDO: menos repos consultados que esto es no haber mirado.
PISO_REPOS=8
