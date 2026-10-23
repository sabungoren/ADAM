# This file was automatically generated for projects
# without default 'CMakeLists.txt' file.

FILE(GLOB_RECURSE app_sources ${CMAKE_SOURCE_DIR}/src/*.c)

idf_component_register(SRCS ${app_sources}
    PRIV_REQUIRES mqtt esp_partition nvs_flash esp_netif app_update esp_http_client mbedtls esp-tls driver esp_adc
    INCLUDE_DIRS "."
)
